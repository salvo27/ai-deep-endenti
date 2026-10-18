// Nei test il client Supabase scaricato dalla CDN è sostituito da un finto locale.
const FAKE_SUPABASE = new URL('../fakes/supabase-js.mjs', import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js')) {
    return { url: FAKE_SUPABASE, shortCircuit: true };
  }
  return next(specifier, context);
}
