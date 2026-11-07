/**
 * Host-side copy for the `/restart` command and its failures, one entry per
 * web-client locale.
 *
 * The Host command catalog carries a single description string; third-party
 * commands have no first-party i18n identity, so the browser cannot localize
 * them. Instead the browser reports its active locale (`POST /api/dsh-restart/locale`)
 * and the Host re-registers the command with the matching copy.
 *
 * @module dsh-restart/messages
 */

/** Language used before a browser reports, and for unsupported locales. */
export const FALLBACK_LANGUAGE = 'en'

/**
 * Copy for every locale the web client ships.
 * Function entries receive the interpolated values (task count, error detail).
 */
export const COMMAND_MESSAGES = Object.freeze({
  en: Object.freeze({
    description: 'Restart the DeepSeek Harness desktop app',
    busy: (count) => `${count} running task(s); restart cancelled. Try again after they finish.`,
    already: 'A restart is already in progress.',
    unsupportedHost: 'This is not the DeepSeek Harness desktop app, so it cannot restart itself.',
    unsupportedPlatform: 'Restart is only implemented for the Windows desktop app.',
    spawn: (detail) => `Could not start the restart helper: ${detail}`,
  }),
  zh: Object.freeze({
    description: '重启 DeepSeek Harness 桌面版',
    busy: (count) => `有 ${count} 个任务正在运行，已取消重启。请等待任务结束后重试。`,
    already: '重启已在进行中。',
    unsupportedHost: '当前不是 DeepSeek Harness 桌面版进程，无法重启应用。',
    unsupportedPlatform: '重启目前只支持 Windows 桌面版。',
    spawn: (detail) => `无法启动重启助手：${detail}`,
  }),
  ja: Object.freeze({
    description: 'DeepSeek Harness デスクトップ版を再起動',
    busy: (count) => `${count} 件のタスクが実行中です。再起動を中止しました。完了後に再試行してください。`,
    already: '再起動はすでに実行中です。',
    unsupportedHost: 'DeepSeek Harness デスクトップ版ではないため、再起動できません。',
    unsupportedPlatform: '再起動は Windows デスクトップ版のみ対応しています。',
    spawn: (detail) => `再起動ヘルパーを起動できませんでした：${detail}`,
  }),
  es: Object.freeze({
    description: 'Reiniciar la aplicación de escritorio de DeepSeek Harness',
    busy: (count) => `Hay ${count} tarea(s) en ejecución; reinicio cancelado. Inténtalo de nuevo cuando terminen.`,
    already: 'Ya hay un reinicio en curso.',
    unsupportedHost: 'No es la aplicación de escritorio de DeepSeek Harness, así que no puede reiniciarse.',
    unsupportedPlatform: 'El reinicio solo está implementado para la aplicación de escritorio de Windows.',
    spawn: (detail) => `No se pudo iniciar el asistente de reinicio: ${detail}`,
  }),
  fr: Object.freeze({
    description: "Redémarrer l'application de bureau DeepSeek Harness",
    busy: (count) => `${count} tâche(s) en cours ; redémarrage annulé. Réessayez une fois terminées.`,
    already: 'Un redémarrage est déjà en cours.',
    unsupportedHost: "Ce n'est pas l'application de bureau DeepSeek Harness ; elle ne peut pas se redémarrer.",
    unsupportedPlatform: "Le redémarrage n'est pris en charge que pour l'application de bureau Windows.",
    spawn: (detail) => `Impossible de démarrer l'assistant de redémarrage : ${detail}`,
  }),
  de: Object.freeze({
    description: 'DeepSeek Harness-Desktop-App neu starten',
    busy: (count) => `${count} laufende Aufgabe(n); Neustart abgebrochen. Versuchen Sie es nach dem Ende erneut.`,
    already: 'Ein Neustart läuft bereits.',
    unsupportedHost: 'Dies ist nicht die DeepSeek Harness-Desktop-App; sie kann sich nicht selbst neu starten.',
    unsupportedPlatform: 'Der Neustart ist nur in der Windows-Desktop-App implementiert.',
    spawn: (detail) => `Der Neustart-Helfer konnte nicht gestartet werden: ${detail}`,
  }),
  ru: Object.freeze({
    description: 'Перезапустить настольное приложение DeepSeek Harness',
    busy: (count) => `Выполняется задач: ${count}; перезапуск отменён. Повторите попытку после завершения.`,
    already: 'Перезапуск уже выполняется.',
    unsupportedHost: 'Это не настольное приложение DeepSeek Harness, перезапуск невозможен.',
    unsupportedPlatform: 'Перезапуск реализован только в настольном приложении для Windows.',
    spawn: (detail) => `Не удалось запустить помощник перезапуска: ${detail}`,
  }),
  pt: Object.freeze({
    description: 'Reiniciar o aplicativo de desktop do DeepSeek Harness',
    busy: (count) => `Há ${count} tarefa(s) em execução; reinício cancelado. Tente novamente após terminarem.`,
    already: 'Já existe um reinício em andamento.',
    unsupportedHost: 'Este não é o aplicativo de desktop do DeepSeek Harness, então não pode reiniciar.',
    unsupportedPlatform: 'O reinício só está implementado no aplicativo de desktop para Windows.',
    spawn: (detail) => `Não foi possível iniciar o assistente de reinício: ${detail}`,
  }),
})

/** Locale ids this plugin ships copy for. */
export const SUPPORTED_LANGUAGES = Object.freeze(Object.keys(COMMAND_MESSAGES))

/**
 * Reduce a browser locale id (`zh-CN`, `PT-br`, `fr`) to a supported language.
 * Unknown languages fall back to English.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeLanguage(value) {
  if (typeof value !== 'string') return FALLBACK_LANGUAGE
  const primary = value.trim().toLowerCase().split(/[-_]/u)[0]
  return Object.hasOwn(COMMAND_MESSAGES, primary) ? primary : FALLBACK_LANGUAGE
}

/**
 * Resolve one localized piece of copy.
 *
 * @param {string} language - canonical language id from {@link normalizeLanguage}.
 * @param {string} key - message key (`description`, `busy`, `already`, ...).
 * @param {...unknown} args - interpolation values for function entries.
 * @returns {string}
 */
export function messageFor(language, key, ...args) {
  const table = Object.hasOwn(COMMAND_MESSAGES, language)
    ? COMMAND_MESSAGES[language]
    : COMMAND_MESSAGES[FALLBACK_LANGUAGE]
  const entry = table[key] ?? COMMAND_MESSAGES[FALLBACK_LANGUAGE][key]
  return typeof entry === 'function' ? String(entry(...args)) : String(entry ?? '')
}
