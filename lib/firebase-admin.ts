import jwt from 'jsonwebtoken';
import { createPrivateKey } from 'crypto';

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_API_SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/identitytoolkit',
].join(' ');
const FIREBASE_AUTH_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const FIREBASE_AUTH_SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
const FIREBASE_AUTH_SIGN_UP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const FIREBASE_AUTH_UPDATE_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:update';

type FirestoreFieldValue =
  | { nullValue: null }
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { mapValue: { fields: Record<string, FirestoreFieldValue> } }
  | { arrayValue: { values: FirestoreFieldValue[] } };

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreFieldValue>;
}

interface FirestoreListResponse {
  documents?: FirestoreDocument[];
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string | null;
}

let tokenCache: { accessToken: string; expiresAtMs: number } | null = null;

function normalizePrivateKey(rawKey: string | undefined): string {
  if (!rawKey) {
    return '';
  }

  let normalized = rawKey.trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  } else {
    normalized = normalized.replace(/^['"]+/, '').replace(/['"]+$/, '');
  }

  normalized = normalized.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

  if (
    normalized.includes('BEGIN PRIVATE KEY') &&
    normalized.includes('END PRIVATE KEY') &&
    !normalized.endsWith('\n')
  ) {
    normalized += '\n';
  }

  return normalized;
}

function createServiceAccountAssertion(): string {
  const key = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  
  if (!key || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
    throw new Error('Missing Firebase credentials in environment');
  }

  const payload = {
    iss: process.env.FIREBASE_CLIENT_EMAIL,
    sub: process.env.FIREBASE_CLIENT_EMAIL,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    scope: GOOGLE_API_SCOPES,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  return jwt.sign(payload, createPrivateKey({ key, format: 'pem' }), { algorithm: 'RS256' });
}

// Generate OAuth access token dari service account untuk akses Firestore REST API.
export async function getFirebaseAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAtMs > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const assertion = createServiceAccountAssertion();
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token request failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    throw new Error('OAuth token response missing access_token');
  }

  const expiresIn = payload.expires_in ?? 3600;
  tokenCache = {
    accessToken: payload.access_token,
    expiresAtMs: Date.now() + expiresIn * 1000,
  };

  return payload.access_token;
}

function toFirestoreFieldValue(value: unknown): FirestoreFieldValue {
  if (value === null) {
    return { nullValue: null };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: value.toString() }
      : { doubleValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreFieldValue(item)),
      },
    };
  }
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreFieldValue> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      fields[key] = toFirestoreFieldValue(nestedValue);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: JSON.stringify(value) };
}

function fromFirestoreFieldValue(value: FirestoreFieldValue | undefined): unknown {
  if (!value) {
    return undefined;
  }
  if ('nullValue' in value) {
    return null;
  }
  if ('stringValue' in value) {
    return value.stringValue;
  }
  if ('booleanValue' in value) {
    return value.booleanValue;
  }
  if ('integerValue' in value) {
    return Number(value.integerValue);
  }
  if ('doubleValue' in value) {
    return value.doubleValue;
  }
  if ('timestampValue' in value) {
    return value.timestampValue;
  }
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map((item) => fromFirestoreFieldValue(item));
  }
  if ('mapValue' in value) {
    const record: Record<string, unknown> = {};
    const fields = value.mapValue.fields ?? {};
    for (const [key, nestedValue] of Object.entries(fields)) {
      record[key] = fromFirestoreFieldValue(nestedValue);
    }
    return record;
  }
  return undefined;
}

function fromFirestoreDocument<T>(document: FirestoreDocument): T {
  const fields = document.fields ?? {};
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    data[key] = fromFirestoreFieldValue(value);
  }
  return data as T;
}

// Helper untuk write ke Firestore via REST API
export async function writeToFirestore(
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const token = await getFirebaseAccessToken();

  if (!projectId) {
    throw new Error('Missing FIREBASE_PROJECT_ID');
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}/${docId}`;

  // Convert data ke Firestore format
  const firestoreData: Record<string, FirestoreFieldValue> = {};
  for (const [key, value] of Object.entries(data)) {
    firestoreData[key] = toFirestoreFieldValue(value);
  }

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: firestoreData,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore write failed: ${response.status} ${text}`);
  }
}

export async function readFromFirestore<T>(documentPath: string): Promise<T | null> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const token = await getFirebaseAccessToken();

  if (!projectId) {
    throw new Error('Missing FIREBASE_PROJECT_ID');
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore read failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as FirestoreDocument;
  return fromFirestoreDocument<T>(payload);
}

export async function listFirestoreCollection<T>(collectionPath: string): Promise<T[]> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const token = await getFirebaseAccessToken();

  if (!projectId) {
    throw new Error('Missing FIREBASE_PROJECT_ID');
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore list failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as FirestoreListResponse;
  return (payload.documents ?? []).map((document) => {
    const data = fromFirestoreDocument<Record<string, unknown>>(document);
    const documentName = document.name ?? '';
    const documentId = documentName.split('/').pop() ?? '';

    if (!('id' in data) && documentId) {
      data.id = documentId;
    }

    return data as T;
  });
}

export async function patchFirestoreDocument(
  documentPath: string,
  data: Record<string, unknown>,
  fieldPaths?: string[]
): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const token = await getFirebaseAccessToken();

  if (!projectId) {
    throw new Error('Missing FIREBASE_PROJECT_ID');
  }

  const params = new URLSearchParams();
  for (const fieldPath of fieldPaths ?? Object.keys(data)) {
    params.append('updateMask.fieldPaths', fieldPath);
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}?${params.toString()}`;
  const firestoreData: Record<string, FirestoreFieldValue> = {};

  for (const [key, value] of Object.entries(data)) {
    firestoreData[key] = toFirestoreFieldValue(value);
  }

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: firestoreData,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore patch failed: ${response.status} ${text}`);
  }
}

export async function deleteFromFirestore(documentPath: string): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const token = await getFirebaseAccessToken();

  if (!projectId) {
    throw new Error('Missing FIREBASE_PROJECT_ID');
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore delete failed: ${response.status} ${text}`);
  }
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!apiKey) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY');
  }

  const response = await fetch(`${FIREBASE_AUTH_LOOKUP_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase token verification failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as {
    users?: Array<{
      localId?: string;
      email?: string;
    }>;
  };

  const user = payload.users?.[0];
  if (!user?.localId) {
    throw new Error('Firebase token verification returned no user');
  }

  return {
    uid: user.localId,
    email: user.email ?? null,
  };
}

function getFirebaseApiKey(): string {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY');
  }
  return apiKey;
}

export async function signInFirebaseUser(email: string, password: string): Promise<{ idToken: string }> {
  const apiKey = getFirebaseApiKey();
  const response = await fetch(`${FIREBASE_AUTH_SIGN_IN_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase sign-in failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as {
    idToken?: string;
  };

  if (!payload.idToken) {
    throw new Error('Firebase sign-in response missing idToken');
  }

  return { idToken: payload.idToken };
}

export async function createFirebaseUser(
  email: string,
  password: string
): Promise<{ uid: string; email: string | null }> {
  const apiKey = getFirebaseApiKey();
  const response = await fetch(`${FIREBASE_AUTH_SIGN_UP_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase sign-up failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as {
    localId?: string;
    email?: string;
  };

  if (!payload.localId) {
    throw new Error('Firebase sign-up response missing localId');
  }

  return {
    uid: payload.localId,
    email: payload.email ?? null,
  };
}

export async function updateFirebaseAccount(
  idToken: string,
  updates: {
    email?: string;
    password?: string;
  }
): Promise<{ email?: string | null }> {
  const apiKey = getFirebaseApiKey();
  const response = await fetch(`${FIREBASE_AUTH_UPDATE_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idToken,
      returnSecureToken: true,
      ...updates,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase account update failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as {
    email?: string;
  };

  return {
    email: payload.email ?? null,
  };
}

export async function adminUpdateFirebaseUser(
  localId: string,
  updates: {
    password?: string;
  }
): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const token = await getFirebaseAccessToken();

  if (!projectId) {
    throw new Error('Missing FIREBASE_PROJECT_ID');
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      localId,
      returnSecureToken: true,
      ...updates,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase admin account update failed: ${response.status} ${text}`);
  }
}
