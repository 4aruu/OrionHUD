import { LIMITS } from "../../shared/validators";
import { OrionError, importBackup } from "../../shared/workflowActions";

/** Imports a backup the user picked. Checks the size before reading the file into memory. */
export async function importBackupFile(file: File): Promise<{ imported: number }> {
  if (file.size > LIMITS.importBytes) throw new OrionError("invalid-backup", "Backup file is larger than 5 MB.");
  return importBackup(await file.text());
}
