export function normalizeStudentName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("el-GR");
}

export function displayStudentName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function isValidStudentName(name: string): boolean {
  const display = displayStudentName(name);
  return display.length > 0 && display.length <= 80;
}

export function displaySchoolName(school: string): string {
  return school.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function isValidSchoolName(school: string): boolean {
  const display = displaySchoolName(school);
  return display.length > 0 && display.length <= 120;
}
