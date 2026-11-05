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
