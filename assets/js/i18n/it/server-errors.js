// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// Un testo per ogni codice che il database manda al posto di una frase (docs/PROGETTI.md, «Errori»).
// tests/unit/server-errors.test.mjs controlla che ci siano tutti i codici di supabase/schema.sql e nessun altro.
export const serverErrors = {
  not_allowed: 'Non hai i permessi per questa operazione.',
  project_not_found: 'Il progetto non esiste o è archiviato.',
  invalid_project_name: 'Il nome del progetto deve avere da 1 a 80 caratteri.',
  invalid_role: 'Ruolo non valido.',
  user_not_found: 'Nessun account con questa email: va creato prima in Supabase.',
  last_platform_admin: 'Deve restare almeno un amministratore della piattaforma.',
  last_project_admin: 'Nel progetto deve restare almeno un admin.',
  cross_project: 'Si può collegare solo un elemento dello stesso progetto.',
  // Elementi delle board.
  invalid_status: 'Stato non valido per questo tipo di elemento.',
  title_required: 'Il titolo è obbligatorio.',
  idea_required: 'Questo elemento deve appartenere a un\'idea.',
  idea_not_allowed: 'Questo elemento non può appartenere a un\'idea.',
  idea_not_found: 'Il collegamento deve indicare un\'idea esistente.',
  // Questionari.
  invalid_survey_token: 'Il link pubblico del questionario non è valido.',
  invalid_survey_settings: 'Impostazioni del questionario non valide.',
  invalid_survey_appearance: 'Aspetto del questionario non valido.',
  invalid_survey_image: 'Immagine del questionario non valida.',
  invalid_experiment: 'L\'esperimento collegato non è valido.',
  experiment_not_in_idea: 'L\'esperimento collegato deve essere della stessa idea.',
  // Spese condivise.
  invalid_expense_group: 'Gruppo di spese non valido.',
  invalid_expense: 'Movimento non valido.',
  expense_group_not_found: 'Il gruppo di spese non esiste.',
  // Impegni e ore lavorate.
  availability_not_trashable: 'Gli impegni non si possono mettere nel cestino.',
  invalid_availability: 'Impegni non validi.',
  timesheet_not_trashable: 'Le ore lavorate non si possono mettere nel cestino.',
  timesheet_week_locked: 'La settimana delle ore non si può cambiare.',
  invalid_timesheet: 'Ore lavorate non valide.',
  timesheet_overlap: 'Due righe dello stesso giorno si accavallano.',
  timesheet_future_week: 'Non si possono segnare ore in una settimana che deve ancora venire.',
  timesheet_future_day: 'Non si possono segnare ore in un giorno che deve ancora venire.',
  // Chat.
  chat_idea_not_found: 'La chat si può collegare solo a un\'idea.',
  chat_archived: 'Questa chat è archiviata.',
  reply_other_chat: 'Si può rispondere solo a un messaggio della stessa chat.',
  message_deleted: 'Il messaggio è già stato eliminato.',
  // Solo per chi gestisce il database: invii programmati e installazione dello schema.
  unknown_job: 'Invio sconosciuto.',
  rls_disabled: 'Una tabella pubblica non ha la Row Level Security attiva.',
};
