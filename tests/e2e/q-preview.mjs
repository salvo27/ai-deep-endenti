// Anteprima della pagina pubblica dei questionari con il client Supabase finto.
// Il test sceglie questionario e risposte con window.__surveyScenario prima di aprire la pagina.
import '../../assets/js/public/survey-api.js';
import { SURVEY } from './q-fixture.mjs';

const scenario = globalThis.__surveyScenario || {};
const submits = [...(scenario.submit || [])];
const fake = globalThis.__fakeSupabase;

fake.responses.rpc.public_survey = () => {
  if (scenario.load === 'network') throw new TypeError('Failed to fetch');
  return { data: scenario.survey ?? SURVEY, error: null };
};
// Una risposta per chiamata, nell'ordine: 'ok', 'network', 'rate_limit' o il risultato di submit_survey.
fake.responses.rpc.submit_survey = () => {
  const next = submits.length ? submits.shift() : 'ok';
  if (next === 'network') throw new TypeError('Failed to fetch');
  if (next === 'rate_limit') return { data: null, error: { status: 429, message: 'Too Many Requests' } };
  return { data: next === 'ok' ? { status: 'ok' } : next, error: null };
};
fake.responses.rpc.survey_event = { data: null, error: null };

await import('../../assets/js/public/survey-page.js');
