import { mount } from '../lib/dom.js';
import { tx } from '../i18n/index.js';
import { pageHeader, emptyState } from './components.js';

// Pagina Progetti (#/progetti), per l'amministratore della piattaforma. Per ora solo un segnaposto: la pagina vera
// (elenco, creazione, rinomina, archiviazione, persone e amministratori) arriva con la prossima fase.
export function projectsView(outlet) {
  const t = tx.projects;
  mount(outlet, pageHeader({ title: t.title }), emptyState(t.placeholder));
}
