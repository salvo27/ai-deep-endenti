// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// Un testo per ogni codice che il database manda al posto di una frase (docs/PROGETTI.md, «Errori»).
export const serverErrors = {
  not_allowed: 'Non hai i permessi per questa operazione.',
  project_not_found: 'Il progetto non esiste o è archiviato.',
  invalid_project_name: 'Il nome del progetto deve avere da 1 a 80 caratteri.',
  invalid_role: 'Ruolo non valido.',
  user_not_found: 'Nessun account con questa email: va creato prima in Supabase.',
  last_platform_admin: 'Deve restare almeno un amministratore della piattaforma.',
  last_project_admin: 'Nel progetto deve restare almeno un admin.',
  cross_project: 'Si può collegare solo un elemento dello stesso progetto.',
};
