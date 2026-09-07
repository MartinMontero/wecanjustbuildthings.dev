/**
 * account-widget-strings.ts — the AccountWidget's en/es/ar string table,
 * extracted from AccountWidget.astro (M4/D9) so locale parity is unit-testable
 * (mirrors the CatalogStrings convention: one typed table, three key-aligned
 * locales). Imported by the widget's client script; nothing here is secret.
 *
 * Note on `placeholder`: a Bluesky handle is ASCII-only by protocol, so the
 * example handle can't be written in Arabic script — the ar value uses the
 * transliteration "anta" (أنت, "you"), paralleling es "tu".
 */
export type AccountStrings = Record<string, string>;

export const ACCOUNT_STRINGS: Record<'en' | 'es' | 'ar', AccountStrings> = {
  en: {
    signIn: 'Sign in', signOut: 'Sign out', heading: 'Sign in', or: 'or',
    nostr: 'Continue with Nostr', bsky: 'Continue with Bluesky', go: 'Continue',
    placeholder: 'you.bsky.social', hint: 'You’ll authorize on your own server, then come back here.',
    signedIn: 'Signed in', connected: 'Signed in with Bluesky.', error: 'Sign-in didn’t finish — please try again.',
    noExt: 'Install a Nostr extension (NIP-07), e.g. nos2x or Alby, then try again.',
    nostrFailed: 'Nostr sign-in didn’t finish — please try again.',
  },
  es: {
    signIn: 'Entrar', signOut: 'Salir', heading: 'Entrar', or: 'o',
    nostr: 'Continuar con Nostr', bsky: 'Continuar con Bluesky', go: 'Continuar',
    placeholder: 'tu.bsky.social', hint: 'Autorizarás en tu propio servidor y volverás aquí.',
    signedIn: 'Sesión iniciada', connected: 'Sesión iniciada con Bluesky.', error: 'No se completó el inicio de sesión — inténtalo de nuevo.',
    noExt: 'Instala una extensión de Nostr (NIP-07), p. ej. nos2x o Alby, e inténtalo de nuevo.',
    nostrFailed: 'No se completó el inicio con Nostr — inténtalo de nuevo.',
  },
  ar: {
    signIn: 'تسجيل الدخول', signOut: 'تسجيل الخروج', heading: 'تسجيل الدخول', or: 'أو',
    nostr: 'المتابعة عبر Nostr', bsky: 'المتابعة عبر بلوسكاي', go: 'متابعة',
    placeholder: 'anta.bsky.social', hint: 'ستوافق على الدخول عبر خادمك ثم تعود إلى هنا.',
    signedIn: 'تم تسجيل الدخول', connected: 'تم تسجيل الدخول عبر بلوسكاي.', error: 'لم يكتمل تسجيل الدخول — حاول مرة أخرى.',
    noExt: 'ثبّت إضافة Nostr ‏(NIP-07)‏ مثل nos2x أو Alby ثم حاول مجددًا.',
    nostrFailed: 'لم يكتمل تسجيل الدخول عبر Nostr — حاول مرة أخرى.',
  },
};
