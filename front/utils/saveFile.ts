import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

/**
 * Save text to a user-chosen path through the Tauri save dialog.
 *
 * The WebView ignores the `download` attribute on a synthetic anchor click, so the
 * browser idiom (Blob + object URL + `link.click()`) silently does nothing here —
 * every file write has to go through the dialog and fs plugins.
 *
 * Returns false when the user cancels the dialog.
 */
export async function saveTextFile(
  content: string,
  defaultPath: string,
  filter: { name: string; extensions: string[] }
): Promise<boolean> {
  const filePath = await save({ defaultPath, filters: [filter] })

  // Null when the user cancels.
  if (!filePath) return false

  await writeTextFile(filePath, content)
  return true
}
