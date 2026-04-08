export interface SearchableCourse {
  title?: string | null;
  description?: string | null;
  category?: string | null;
}

export interface SearchableUser {
  username?: string | null;
  email?: string | null;
  role?: string | null;
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

function matchesKeyword(value: string | null | undefined, keyword: string): boolean {
  return typeof value === 'string' && value.toLowerCase().includes(keyword);
}

export function searchCourses<T extends SearchableCourse>(courses: T[], keyword: string): T[] {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) {
    return courses;
  }

  return courses.filter((course) =>
    matchesKeyword(course.title, normalizedKeyword) ||
    matchesKeyword(course.description, normalizedKeyword) ||
    matchesKeyword(course.category, normalizedKeyword)
  );
}

export function searchUsers<T extends SearchableUser>(users: T[], keyword: string): T[] {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) {
    return users;
  }

  return users.filter((user) =>
    matchesKeyword(user.username, normalizedKeyword) ||
    matchesKeyword(user.email, normalizedKeyword) ||
    matchesKeyword(user.role, normalizedKeyword)
  );
}
