'use strict';

// +--------------------------------------------------------------+
// |                             WIKI                             |
// +--------------------------------------------------------------+
// Dokumentliste, Ordnerstruktur, Viewer und Wiki-Darstellung.

async function loadDocuments(selectId = null, navigate = true) {
  const [documents, folders] = await Promise.all([
    api('/api/wiki/documents'),
    api('/api/wiki/folders'),
  ]);
  state.documents = documents;
  state.folders = folders;
  $('documentCount').textContent = String(state.documents.length);
  renderDocumentList();
  renderDashboard();
  if (!navigate) return;
  if (selectId) await openDocument(selectId, true);
  else if (state.current && state.documents.some(d => d.id === state.current.id)) await openDocument(state.current.id, true);
  else if (state.documents.length) await openDocument(state.documents[0].id, true);
  else showEmpty();
}

async function refreshDocumentList() {
  const [documents, folders] = await Promise.all([
    api('/api/wiki/documents'),
    api('/api/wiki/folders'),
  ]);
  state.documents = documents;
  state.folders = folders;
  $('documentCount').textContent = String(state.documents.length);
  renderDocumentList();
  renderDashboard();
}

function folderById(id) {
  if (!id) return null;
  return state.folders.find(f => String(f.id) === String(id)) || null;
}

function folderPath(folderId) {
  if (!folderId) return 'Ohne Ordner';
  const names = [];
  const seen = new Set();
  let current = folderById(folderId);
  while (current && !seen.has(String(current.id))) {
    seen.add(String(current.id));
    names.unshift(current.name);
    current = folderById(current.parent_id);
  }
  return names.join(' / ') || 'Ohne Ordner';
}

function folderDepth(folderId) {
  let depth = 0;
  const seen = new Set();
  let current = folderById(folderId);
  while (current && current.parent_id && !seen.has(String(current.id))) {
    seen.add(String(current.id));
    depth += 1;
    current = folderById(current.parent_id);
  }
  return depth;
}

function folderDescendantCount(folderId) {
  const directDocs = state.documents.filter(d => String(d.folder_id || '') === String(folderId)).length;
  const children = state.folders.filter(f => String(f.parent_id || '') === String(folderId));
  return directDocs + children.reduce((sum, child) => sum + folderDescendantCount(child.id), 0);
}

function sortedFolders(parentId) {
  return state.folders
    .filter(f => String(f.parent_id || '') === String(parentId || ''))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' }));
}

function sortedDocuments(folderId) {
  return state.documents
    .filter(d => String(d.folder_id || '') === String(folderId || ''))
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'de', { sensitivity: 'base' }));
}

function makeDocumentTreeItem(doc, depth = 0, pathLabel = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tree-doc' + (state.current && state.current.id === doc.id ? ' active' : '');
  b.style.setProperty('--tree-depth', String(depth));
  b.setAttribute('role', 'treeitem');
  const title = document.createElement('strong');
  title.textContent = doc.title;
  const small = document.createElement('small');
  const owner = String(doc.created_by || '').toLowerCase() === String(state.session.username || '').toLowerCase() ? ' · eigen' : '';
  small.textContent = pathLabel || `Version ${doc.version} · ${formatDate(doc.updated_at)}${owner}`;
  b.append(title, small);
  b.addEventListener('click', () => openDocument(doc.id));
  return b;
}

function renderFolderNode(folder, depth) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-folder-wrap';
  wrapper.setAttribute('role', 'treeitem');
  wrapper.setAttribute('aria-expanded', String(!state.collapsedFolders.has(String(folder.id))));

  const row = document.createElement('div');
  row.className = 'tree-folder-row';
  row.style.setProperty('--tree-depth', String(depth));

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tree-toggle';
  const collapsed = state.collapsedFolders.has(String(folder.id));
  toggle.textContent = collapsed ? '▸' : '▾';
  toggle.title = collapsed ? 'Ordner aufklappen' : 'Ordner einklappen';
  toggle.addEventListener('click', () => {
    const key = String(folder.id);
    if (state.collapsedFolders.has(key)) state.collapsedFolders.delete(key);
    else state.collapsedFolders.add(key);
    renderDocumentList();
  });

  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'tree-folder-label';
  const count = folderDescendantCount(folder.id);
  label.innerHTML = `<span class="folder-icon" aria-hidden="true">▰</span><span class="folder-name"></span><span class="folder-count"></span>`;
  label.querySelector('.folder-name').textContent = folder.name;
  label.querySelector('.folder-count').textContent = String(count);
  label.addEventListener('click', () => toggle.click());

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'tree-row-action';
  add.textContent = '+';
  add.title = 'Unterordner erstellen';
  add.setAttribute('aria-label', `Unterordner in ${folder.name} erstellen`);
  add.addEventListener('click', () => openNewFolderDialog(folder.id));

  row.append(toggle, label, add);
  if (folder.can_edit) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'tree-row-action';
    more.textContent = '⋯';
    more.title = 'Ordner bearbeiten';
    more.setAttribute('aria-label', `${folder.name} bearbeiten`);
    more.addEventListener('click', () => openEditFolderDialog(folder.id));
    row.appendChild(more);
  }
  wrapper.appendChild(row);

  if (!collapsed) {
    const children = document.createElement('div');
    children.className = 'tree-children';
    sortedDocuments(folder.id).forEach(doc => children.appendChild(makeDocumentTreeItem(doc, depth + 1)));
    sortedFolders(folder.id).forEach(child => children.appendChild(renderFolderNode(child, depth + 1)));
    wrapper.appendChild(children);
  }
  return wrapper;
}

function renderDocumentList() {
  const query = docSearch.value.trim().toLowerCase();
  docList.replaceChildren();
  $('documentCount').textContent = String(state.documents.length);

  if (query) {
    const matches = state.documents
      .filter(d => `${d.title || ''} ${folderPath(d.folder_id)}`.toLowerCase().includes(query))
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'de', { sensitivity: 'base' }));
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'Keine Dokumentationen gefunden.';
      docList.appendChild(empty);
      return;
    }
    matches.forEach(doc => docList.appendChild(makeDocumentTreeItem(doc, 0, folderPath(doc.folder_id))));
    return;
  }

  const rootDocs = sortedDocuments(null);
  if (rootDocs.length) {
    const group = document.createElement('div');
    group.className = 'tree-root-group';
    const head = document.createElement('div');
    head.className = 'tree-root-label';
    head.textContent = `Ohne Ordner (${rootDocs.length})`;
    group.appendChild(head);
    rootDocs.forEach(doc => group.appendChild(makeDocumentTreeItem(doc, 0)));
    docList.appendChild(group);
  }

  sortedFolders(null).forEach(folder => docList.appendChild(renderFolderNode(folder, 0)));
  if (!state.documents.length && !state.folders.length) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = 'Noch keine Dokumentationen oder Ordner.';
    docList.appendChild(empty);
  }
}

function showEmpty() {
  state.current = null;
  state.editing = null;
  state.editingSnapshot = null;
  viewer.hidden = true;
  editor.hidden = true;
  activityView.hidden = true;
  adminView.hidden = true;
  dashboardView.hidden = true;
  emptyState.hidden = false;
  setModuleMode('wiki');
  renderDocumentList();
}

async function openDocument(id, force = false) {
  if (!force && state.editing && isDirty()) {
    const proceed = window.confirm('Es gibt ungespeicherte Änderungen. Dokument trotzdem wechseln?');
    if (!proceed) return;
  }
  try {
    state.editing = null;
    state.editingSnapshot = null;
    state.current = await api(`/api/wiki/documents/${encodeURIComponent(id)}`);
    state.activityDocumentId = null;
    $('documentsViewBtn').classList.add('active');
    $('activityBtn')?.classList.remove('active');
    adminView.hidden = true;
    dashboardView.hidden = true;
    setModuleMode('wiki');
    renderDocumentList();
    renderViewer();
  } catch (err) {
    alert(err.message);
  }
}

function metaNodes(doc, editingMode = false) {
  const frag = document.createDocumentFragment();
  const items = [
    ['Autor', doc.created_by || state.session.username],
    ['Ordner', folderPath(doc.folder_id)],
    ['Status', doc.isNew ? 'Entwurf' : 'Gespeichert'],
    ['Version', doc.isNew ? 'noch nicht gespeichert' : String(doc.version || 1)],
  ];
  if (!doc.isNew && doc.updated_at) items.push(['Geändert', formatDate(doc.updated_at)]);
  if (editingMode && doc.updated_by) items.push(['Bearbeiter', doc.updated_by]);
  items.forEach(([label, value]) => {
    const span = document.createElement('span');
    span.append(document.createTextNode(`${label}: `));
    const b = document.createElement('b');
    b.textContent = value || '—';
    span.appendChild(b);
    frag.appendChild(span);
  });
  return frag;
}

function buildNumbering(blocks) {
  let h = 0;
  let sh = 0;
  const map = new Map();
  const headings = [];
  for (const block of blocks || []) {
    if (block.type === 'heading') {
      h += 1;
      sh = 0;
      const number = `${h}`;
      map.set(block.id, number);
      headings.push({ level: 1, number, text: String(block.content || ''), id: `h-${block.id}` });
    } else if (block.type === 'subheading') {
      if (h === 0) h = 1;
      sh += 1;
      const number = `${h}.${sh}`;
      map.set(block.id, number);
      headings.push({ level: 2, number, text: String(block.content || ''), id: `h-${block.id}` });
    }
  }
  return { map, headings };
}

function renderViewer() {
  if (!state.current) return showEmpty();
  editor.hidden = true;
  activityView.hidden = true;
  adminView.hidden = true;
  dashboardView.hidden = true;
  emptyState.hidden = true;
  viewer.hidden = false;
  setModuleMode('wiki');
  $('viewTitle').textContent = state.current.title;
  $('viewMeta').replaceChildren(metaNodes(state.current));
  exportDocBtn.hidden = false;
  editBtn.hidden = !canEditDocument(state.current);
  moveDocBtn.hidden = !canEditDocument(state.current);
  dangerZone.hidden = true;
  viewBlocks.replaceChildren();

  const blocks = state.current.blocks || [];
  const numbering = buildNumbering(blocks);
  for (const block of blocks) {
    if (block.type === 'title') continue;
    const node = renderViewBlock(block, numbering.map.get(block.id), numbering.headings);
    if (node) viewBlocks.appendChild(node);
  }
}

function renderViewBlock(block, number, headings) {
  if (block.type === 'summary') {
    const box = document.createElement('section');
    box.className = 'summary-box';
    const h = document.createElement('h3'); h.textContent = 'Zusammenfassung';
    const p = document.createElement('p'); p.textContent = block.content || '';
    box.append(h, p); return box;
  }
  if (block.type === 'toc') {
    const box = document.createElement('nav');
    box.className = 'toc-box';
    box.setAttribute('aria-label', 'Inhaltsverzeichnis');
    const h = document.createElement('h3'); h.textContent = 'Inhaltsverzeichnis';
    box.appendChild(h);
    if (!headings.length) {
      const s = document.createElement('span'); s.className = 'empty-note'; s.textContent = 'Noch keine Überschriften vorhanden.'; box.appendChild(s);
    } else {
      headings.forEach(item => {
        const a = document.createElement('a');
        a.href = `#${item.id}`;
        a.className = item.level === 2 ? 'sub' : '';
        a.textContent = `${item.number} ${item.text || 'Unbenannte Überschrift'}`;
        box.appendChild(a);
      });
    }
    return box;
  }
  if (block.type === 'heading' || block.type === 'subheading') {
    const h = document.createElement(block.type === 'heading' ? 'h2' : 'h3');
    h.className = `render-heading ${block.type === 'heading' ? 'level-1' : 'level-2'}`;
    h.id = `h-${block.id}`;
    h.textContent = `${number || ''}${number ? ' ' : ''}${block.content || ''}`;
    return h;
  }
  if (block.type === 'paragraph') {
    const p = document.createElement('p'); p.className = 'render-paragraph'; p.textContent = block.content || ''; return p;
  }
  if (block.type === 'code') {
    const data = block.content || {};
    const wrap = document.createElement('section'); wrap.className = 'code-block';
    const head = document.createElement('div'); head.className = 'code-head'; head.textContent = data.language || 'text';
    const pre = document.createElement('pre'); const code = document.createElement('code'); code.textContent = data.code || ''; pre.appendChild(code);
    wrap.append(head, pre); return wrap;
  }
  if (block.type === 'table') {
    const data = block.content || { columns: [], rows: [] };
    const table = document.createElement('table'); table.className = 'render-table';
    const thead = document.createElement('thead'); const hr = document.createElement('tr');
    (data.columns || []).forEach(c => { const th = document.createElement('th'); th.textContent = c; hr.appendChild(th); });
    thead.appendChild(hr); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    (data.rows || []).forEach(row => { const tr = document.createElement('tr'); (data.columns || []).forEach((_, i) => { const td = document.createElement('td'); td.textContent = (row || [])[i] || ''; tr.appendChild(td); }); tbody.appendChild(tr); });
    table.appendChild(tbody); return table;
  }
  if (block.type === 'checklist') {
    const ul = document.createElement('ul'); ul.className = 'checklist-view';
    (Array.isArray(block.content) ? block.content : []).forEach(item => {
      const li = document.createElement('li'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.disabled = true; cb.checked = !!item.checked;
      const span = document.createElement('span'); span.textContent = item.text || ''; li.append(cb, span); ul.appendChild(li);
    });
    return ul;
  }
  if (block.type === 'notice') {
    const data = block.content || {};
    const div = document.createElement('div'); div.className = `notice ${data.level || 'info'}`; div.textContent = data.text || ''; return div;
  }
  if (block.type === 'quote') {
    const data = block.content || {};
    const q = document.createElement('blockquote'); q.appendChild(document.createTextNode(data.text || ''));
    if (data.source) { const footer = document.createElement('footer'); footer.textContent = `— ${data.source}`; q.appendChild(footer); }
    return q;
  }
  if (block.type === 'linklist') {
    const ul = document.createElement('ul'); ul.className = 'link-list';
    (Array.isArray(block.content) ? block.content : []).forEach(item => {
      const li = document.createElement('li'); const a = document.createElement('a');
      a.href = safeLink(item.url); a.textContent = item.label || item.url || 'Link';
      if (/^https?:/i.test(a.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      li.appendChild(a); ul.appendChild(li);
    });
    return ul;
  }
  if (['image', 'video', 'audio'].includes(block.type)) {
    const data = block.content || {};
    const wrap = document.createElement('figure'); wrap.className = 'media-block';
    if (!data.mediaId) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Keine Datei hinterlegt.'; return p; }
    let media;
    if (block.type === 'image') { media = document.createElement('img'); media.alt = data.caption || ''; }
    if (block.type === 'video') { media = document.createElement('video'); media.controls = true; media.preload = 'metadata'; }
    if (block.type === 'audio') { media = document.createElement('audio'); media.controls = true; media.preload = 'metadata'; }
    media.src = `/api/media/${encodeURIComponent(data.mediaId)}`; wrap.appendChild(media);
    if (data.caption) { const fig = document.createElement('figcaption'); fig.textContent = data.caption; wrap.appendChild(fig); }
    return wrap;
  }
  if (block.type === 'error_handling') {
    const section = document.createElement('section'); section.className = 'error-section';
    const h = document.createElement('h2'); h.textContent = 'Error-Handling';
    const p = document.createElement('p'); p.textContent = block.content || '';
    section.append(h, p); return section;
  }
  return null;
}
