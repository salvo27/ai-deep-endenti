// Same entries as ../it/server-errors.js, which is the reference: tests/unit/i18n.test.mjs checks it.
export const serverErrors = {
  not_allowed: 'You do not have permission to do this.',
  project_not_found: 'The project does not exist or has been archived.',
  invalid_project_name: 'The project name must be 1 to 80 characters long.',
  invalid_role: 'Invalid role.',
  user_not_found: 'No account with this email: create it in Supabase first.',
  last_platform_admin: 'At least one platform administrator must remain.',
  last_project_admin: 'The project must keep at least one admin.',
  cross_project: 'You can only link an item of the same project.',
};
