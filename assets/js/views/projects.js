import { h, mount, busy, confirmDialog, promptDialog, toast } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { fmtDate, initials } from '../lib/format.js';
import { LIMITS, cleanLine, isEmail } from '../lib/validate.js';
import { tx } from '../i18n/index.js';
import { currentProjectId, emit, isPlatformAdmin, reloadMembers, setPlatformAdmin, setProject, setProjects, state } from '../store.js';
import { button, emptyState, errorBox, loading, pageHeader } from './components.js';

// Pagina Progetti (#/progetti), solo per l'amministratore della piattaforma (docs/PROGETTI.md): tutti i progetti, le
// persone di ciascuno e gli amministratori della piattaforma. Non mostra mai i contenuti di un progetto.

const t = tx.projects;
const ROLES = ['admin', 'member', 'advisor'];
const roleName = (role) => (Object.hasOwn(tx.common.roles, role ?? '') ? tx.common.roles[role] : role || '');

export const PROJECT_NAME_MAX = 80;

/**
 * The name as the database takes it: from 1 to 80 characters once the spaces at the edges are gone, counted as
 * Postgres counts them (an emoji is one character). Anything else gives null.
 */
export function cleanProjectName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  const length = [...name].length;
  return length >= 1 && length <= PROJECT_NAME_MAX ? name : null;
}

const invalidName = () => ({ message: tx.serverErrors.invalid_project_name });

// My projects and my role on the platform, as the menu shows them: they change when I add or remove myself, rename or
// archive one of mine, or stop being a platform administrator. The menu hears it from the 'projects' event.
async function refreshMine() {
  try {
    setProjects(await api.myProjects());
  } catch {
    // the menu keeps the list it has until the next reload
  }
  emit('projects');
}

// Members are not sent live any more: a change to the open project reaches the rest of the site from here. When I can no
// longer read it (I archived it, or removed myself) the store says 'removed', and app.js opens another of my projects
// or the Projects page.
function refreshOpenProject(projectId) {
  if (projectId && projectId === currentProjectId()) reloadMembers().catch(() => {});
}

// The avatar of components.js knows only the members of the open project: here the people come from any project.
const personDot = (row) =>
  h(
    'span',
    { class: 'avatar', 'aria-hidden': 'true', style: { '--avatar': row.color || '#8a8f98', width: '26px', height: '26px', fontSize: '10px' } },
    initials(row.display_name || '?'),
  );

const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);

function createCard(onCreated) {
  const name = h('input', { class: 'input', type: 'text', name: 'name', maxlength: PROJECT_NAME_MAX, required: true, placeholder: t.create.placeholder });
  const error = h('div');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, t.create.submit);
  const form = h(
    'form',
    { class: 'card form project-create', novalidate: true },
    h('h2', null, t.create.title),
    h('p', { class: 'muted small' }, t.create.help),
    field(t.name, name),
    error,
    submit,
  );
  form.addEventListener('submit', busy(submit, async (event) => {
    event.preventDefault();
    mount(error);
    const clean = cleanProjectName(name.value);
    if (!clean) {
      mount(error, errorBox(invalidName()));
      return;
    }
    try {
      const created = await api.createProject(clean);
      name.value = '';
      toast(t.create.done(clean), { type: 'success' });
      await onCreated(created);
    } catch (e) {
      mount(error, errorBox(e));
    }
  }));
  return form;
}

function addPersonForm(project, onAdded) {
  const a = t.people.add;
  const email = h('input', { class: 'input', type: 'email', name: 'email', maxlength: 254, required: true, placeholder: a.emailPlaceholder });
  const name = h('input', { class: 'input', type: 'text', name: 'name', maxlength: LIMITS.displayName, placeholder: a.namePlaceholder });
  const role = h('select', { class: 'input', name: 'role' }, ROLES.map((value) => h('option', { value, selected: value === 'member' }, roleName(value))));
  const error = h('div');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, a.submit);
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('h3', null, a.title),
    h('p', { class: 'muted small' }, a.help),
    h('div', { class: 'form-grid' }, field(a.email, email), field(a.name, name), field(a.role, role)),
    error,
    submit,
  );
  form.addEventListener('submit', busy(submit, async (event) => {
    event.preventDefault();
    mount(error);
    const address = email.value.trim();
    if (!isEmail(address)) {
      mount(error, errorBox({ message: a.invalid }));
      return;
    }
    try {
      // Without a name the database keeps the profile there is, or uses the first part of the email.
      await api.addMember(project().id, address, cleanLine(name.value, LIMITS.displayName) || null, role.value);
      email.value = '';
      name.value = '';
      toast(a.done, { type: 'success' });
      await onAdded();
    } catch (e) {
      mount(error, errorBox(e));
    }
  }));
  return form;
}

// The people of one project, from members_overview: the platform administrator reads them even without being a member.
function peoplePanel(initial, { onClose, onChanged }) {
  const p = t.people;
  let project = initial;
  let rows = [];
  const title = h('h2');
  const error = h('div');
  const tableHost = h('div', null, loading());
  const formHost = h('div');
  const section = h(
    'section',
    { class: 'card card-stack project-people' },
    h('div', { class: 'card-head' }, title, button(p.close, { iconName: 'close', onClick: onClose })),
    h('p', { class: 'muted small' }, p.roles),
    error,
    tableHost,
    formHost,
  );

  const load = async () => {
    try {
      rows = (await api.membersOverview(project.id)) || [];
      renderTable();
    } catch (e) {
      mount(tableHost, errorBox(e));
    }
  };
  // After a change the database has the last word: the people, the counts of the list and my own projects.
  const changed = async () => {
    await load();
    await onChanged(project.id);
  };

  const remove = async (row, name) => {
    const isMe = row.user_id === state.user?.id;
    const ok = await confirmDialog(isMe ? p.removeSelf(project.name) : p.removeMessage(project.name), { title: p.removeTitle(name), okLabel: p.removeOk, danger: true });
    if (!ok) return;
    mount(error);
    try {
      await api.removeMember(project.id, row.user_id);
      toast(p.removed, { type: 'success' });
      await changed();
    } catch (e) {
      mount(error, errorBox(e));
    }
  };

  const changeRole = async (row, role) => {
    mount(error);
    try {
      await api.updateMemberRole(project.id, row.user_id, role);
      toast(p.roleChanged, { type: 'success' });
      await changed();
    } catch (e) {
      mount(error, errorBox(e));
      // The select goes back to the role the database still has.
      await load();
    }
  };

  function renderTable() {
    if (!rows.length) {
      mount(tableHost, h('p', { class: 'muted' }, p.empty));
      return;
    }
    mount(
      tableHost,
      h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table people-table' },
          h('thead', null, h('tr', null, [p.columns.person, p.columns.email, p.columns.role, ''].map((label) => h('th', null, label)))),
          h(
            'tbody',
            null,
            rows.map((row) => {
              const isMe = row.user_id === state.user?.id;
              const name = row.display_name || p.noName;
              const select = h(
                'select',
                { class: 'input input-small', 'aria-label': p.roleOf(name), onChange: (event) => changeRole(row, event.target.value) },
                ROLES.map((value) => h('option', { value, selected: value === row.role }, roleName(value))),
              );
              return h(
                'tr',
                null,
                h('td', null, personDot(row), ' ', h('span', { class: 'person-name' }, name, isMe ? ` ${p.you}` : '')),
                h('td', null, row.email || ''),
                h('td', null, select),
                h('td', { class: 'row-actions' }, button(p.removeOk, { iconName: 'trash', title: p.removeOf(name), onClick: () => remove(row, name) })),
              );
            }),
          ),
        ),
      ),
    );
  }

  // Name and state of the project can change while the panel is open (rename, archive, reactivate).
  function renderFrame() {
    title.textContent = p.title(project.name);
    mount(formHost, project.archived_at ? h('p', { class: 'muted' }, p.archived) : addPersonForm(() => project, changed));
  }

  renderFrame();
  load();
  return {
    section,
    id: () => project.id,
    update(next) {
      project = next;
      renderFrame();
    },
  };
}

function platformAdminsCard(onLostRole) {
  const a = t.admins;
  const listHost = h('div', null, loading());
  const error = h('div');
  const email = h('input', { class: 'input', type: 'email', name: 'email', maxlength: 254, required: true, placeholder: t.people.add.emailPlaceholder });
  const formError = h('div');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, a.add.submit);
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('p', { class: 'muted small' }, a.add.help),
    field(a.add.label, email),
    formError,
    submit,
  );

  const load = async () => {
    try {
      const rows = (await api.platformAdmins()) || [];
      mount(
        listHost,
        h(
          'ul',
          { class: 'list admins-list' },
          rows.map((row) => {
            const isMe = row.user_id === state.user?.id;
            const name = row.display_name || a.noProfile;
            return h(
              'li',
              { class: 'factor' },
              h('div', null, h('strong', { class: 'admin-name' }, name, isMe ? ` ${a.you}` : ''), h('div', { class: 'muted small' }, a.since(fmtDate(row.created_at)))),
              button(a.removeOk, { iconName: 'trash', title: a.removeOf(name), onClick: () => remove(row, name, isMe) }),
            );
          }),
        ),
      );
    } catch (e) {
      mount(listHost, errorBox(e));
    }
  };

  const remove = async (row, name, isMe) => {
    const ok = await confirmDialog(isMe ? a.removeSelf : a.removeMessage(name), { title: a.removeTitle, okLabel: a.removeOk, danger: true });
    if (!ok) return;
    mount(error);
    try {
      await api.removePlatformAdmin(row.user_id);
    } catch (e) {
      mount(error, errorBox(e));
      return;
    }
    toast(a.removed, { type: 'success' });
    if (isMe) {
      // The database no longer lets me manage anything: the page and the menu stop offering it.
      setPlatformAdmin(false);
      emit('projects');
      onLostRole();
      return;
    }
    await load();
  };

  form.addEventListener('submit', busy(submit, async (event) => {
    event.preventDefault();
    mount(formError);
    const address = email.value.trim();
    if (!isEmail(address)) {
      mount(formError, errorBox({ message: a.add.invalid }));
      return;
    }
    try {
      await api.addPlatformAdmin(address);
      email.value = '';
      toast(a.add.done, { type: 'success' });
      await load();
    } catch (e) {
      mount(formError, errorBox(e));
    }
  }));

  load();
  return h('section', { class: 'card card-stack platform-admins' }, h('h2', null, a.title), h('p', { class: 'muted small' }, a.help), error, listHost, form);
}

function notAllowed(outlet) {
  mount(outlet, pageHeader({ title: t.title }), emptyState(t.notAllowed));
}

export function projectsView(outlet) {
  if (!isPlatformAdmin()) {
    notAllowed(outlet);
    return null;
  }
  const l = t.list;
  let projects = [];
  let panel = null;
  const listError = h('div');
  const listHost = h('div', null, loading());
  const peopleHost = h('div');

  const loadList = async () => {
    try {
      projects = (await api.allProjects()) || [];
      renderList();
      const shown = panel && projects.find((p) => p.id === panel.id());
      if (shown) panel.update(shown);
    } catch (e) {
      mount(listHost, errorBox(e));
    }
  };

  const showPeople = (project) => {
    panel = peoplePanel(project, {
      onClose: () => {
        panel = null;
        mount(peopleHost);
      },
      onChanged: async (projectId) => {
        await loadList();
        await refreshMine();
        refreshOpenProject(projectId);
      },
    });
    mount(peopleHost, panel.section);
  };

  // Every action reports its error above the list, in the words of its code.
  const act = async (call) => {
    mount(listError);
    try {
      await call();
    } catch (e) {
      mount(listError, errorBox(e));
    }
  };

  const rename = (project) =>
    act(async () => {
      const value = await promptDialog({ title: t.rename.title(project.name), label: t.rename.label, value: project.name, maxLength: PROJECT_NAME_MAX, okLabel: tx.common.actions.rename });
      if (value === null) return;
      const clean = cleanProjectName(value);
      if (!clean) throw invalidName();
      await api.renameProject(project.id, clean);
      toast(t.rename.done(clean), { type: 'success' });
      if (project.id === currentProjectId()) setProject({ ...state.project, name: clean });
      await loadList();
      await refreshMine();
    });

  // Archiving says what it does before doing it: the members can no longer read nor write, the data stays.
  const setArchived = (project, archive) =>
    act(async () => {
      const texts = archive ? t.archive : t.unarchive;
      const ok = await confirmDialog(texts.message, { title: texts.title(project.name), okLabel: texts.ok, danger: archive });
      if (!ok) return;
      await (archive ? api.archiveProject(project.id) : api.unarchiveProject(project.id));
      toast(texts.done(project.name), { type: 'success' });
      await loadList();
      await refreshMine();
      refreshOpenProject(project.id);
    });

  function renderList() {
    if (!projects.length) {
      mount(listHost, h('p', { class: 'muted' }, l.empty));
      return;
    }
    mount(
      listHost,
      h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table projects-table' },
          h('thead', null, h('tr', null, [l.columns.name, l.columns.members, l.columns.admins, l.columns.state, ''].map((label) => h('th', null, label)))),
          h(
            'tbody',
            null,
            projects.map((project) => {
              const mine = state.projects.find((p) => p.id === project.id);
              const archived = Boolean(project.archived_at);
              return h(
                'tr',
                null,
                h('td', null, h('strong', null, project.name), mine ? [' ', h('span', { class: 'badge badge-soft' }, l.mine(roleName(mine.role)))] : null),
                h('td', null, String(project.member_count ?? 0)),
                h('td', null, String(project.admin_count ?? 0), project.admin_count === 0 ? [' ', h('span', { class: 'badge badge-warn' }, l.noAdmin)] : null),
                h('td', null, h('span', { class: ['badge', archived ? 'badge-soft' : 'badge-ok'] }, archived ? l.archived : l.active)),
                h(
                  'td',
                  { class: 'row-actions' },
                  button(l.people, { iconName: 'users', title: l.peopleOf(project.name), onClick: () => showPeople(project) }),
                  archived ? null : button(tx.common.actions.rename, { iconName: 'edit', title: l.renameOf(project.name), onClick: () => rename(project) }),
                  archived
                    ? button(t.unarchive.ok, { iconName: 'restore', title: l.unarchiveOf(project.name), onClick: () => setArchived(project, false) })
                    : button(t.archive.ok, { iconName: 'trash', title: l.archiveOf(project.name), onClick: () => setArchived(project, true) }),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }

  mount(
    outlet,
    pageHeader({ title: t.title, subtitle: t.subtitle }),
    h('p', { class: 'banner projects-privacy' }, t.privacy),
    createCard(async (created) => {
      await loadList();
      showPeople(projects.find((p) => p.id === created?.id) || created);
    }),
    h('section', { class: 'card card-stack projects-list' }, h('h2', null, l.title), listError, listHost),
    peopleHost,
    platformAdminsCard(() => notAllowed(outlet)),
  );
  loadList();
  return null;
}
