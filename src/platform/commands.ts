/** The user's current key binding for a manifest command, or null if unbound/unknown. */
export async function getShortcut(name: string): Promise<string | null> {
  try {
    const all = await chrome.commands.getAll();
    return all.find((c) => c.name === name)?.shortcut || null;
  } catch {
    return null;
  }
}
