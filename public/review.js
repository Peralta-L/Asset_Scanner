const ROWS_PER_PAGE = 25;

let allAssets = [];
let currentPage = 1;

function setStatus(msg) {
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.textContent = msg;
}

const FIELDS = ['InventoryNumber', 'SerialNumber', 'Model', 'Brand', 'ItemType', 'AssignedTo'];

function renderPage(page) {
    const tableBody = document.getElementById('review-data');
    if (!tableBody) return;

    const totalPages = Math.max(1, Math.ceil(allAssets.length / ROWS_PER_PAGE));
    currentPage = Math.min(Math.max(1, page), totalPages);

    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const pageItems = allAssets.slice(start, start + ROWS_PER_PAGE);

    tableBody.innerHTML = '';

    if (pageItems.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7">No assets found.</td></tr>`;
    } else {
        pageItems.forEach(asset => tableBody.appendChild(buildRow(asset)));
    }

    updatePaginationUI(totalPages);
}

function buildRow(asset) {
    const row = document.createElement('tr');
    row.dataset.id = asset.id;
    row.innerHTML = `
        <td>${asset.InventoryNumber ?? ''}</td>
        <td>${asset.SerialNumber ?? ''}</td>
        <td>${asset.Model ?? ''}</td>
        <td>${asset.Brand ?? ''}</td>
        <td>${asset.ItemType ?? ''}</td>
        <td>${asset.AssignedTo ?? ''}</td>
        <td class="actions-cell">
            <button type="button" class="edit-row-btn">Edit</button>
            <button type="button" class="delete-row-btn">Delete</button>
        </td>
    `;

    row.querySelector('.edit-row-btn').addEventListener('click', () => enterEditMode(row, asset));
    row.querySelector('.delete-row-btn').addEventListener('click', () => deleteRow(row, asset));

    return row;
}

function enterEditMode(row, asset) {
    row.innerHTML = `
        <td><input type="text" class="edit-input" data-field="InventoryNumber" value="${asset.InventoryNumber ?? ''}"></td>
        <td><input type="text" class="edit-input" data-field="SerialNumber" value="${asset.SerialNumber ?? ''}"></td>
        <td><input type="text" class="edit-input" data-field="Model" value="${asset.Model ?? ''}"></td>
        <td><input type="text" class="edit-input" data-field="Brand" value="${asset.Brand ?? ''}"></td>
        <td><input type="text" class="edit-input" data-field="ItemType" value="${asset.ItemType ?? ''}"></td>
        <td><input type="text" class="edit-input" data-field="AssignedTo" value="${asset.AssignedTo ?? ''}"></td>
        <td class="actions-cell">
            <button type="button" class="save-row-btn">Save</button>
            <button type="button" class="cancel-row-btn">Cancel</button>
        </td>
    `;

    row.querySelector('.save-row-btn').addEventListener('click', () => saveRow(row, asset));
    row.querySelector('.cancel-row-btn').addEventListener('click', () => {
        row.replaceWith(buildRow(asset));
    });
}

async function saveRow(row, asset) {
    const saveBtn = row.querySelector('.save-row-btn');
    const cancelBtn = row.querySelector('.cancel-row-btn');
    saveBtn.disabled = true;
    cancelBtn.disabled = true;

    const updated = { ...asset };
    row.querySelectorAll('.edit-input').forEach(input => {
        updated[input.dataset.field] = input.value;
    });

    try {
        const response = await fetch(`/assets/${asset.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || 'Failed to save changes');
        }

        const idx = allAssets.findIndex(a => a.id === asset.id);
        if (idx !== -1) allAssets[idx] = updated;

        row.replaceWith(buildRow(updated));
        setStatus('Asset updated.');
    } catch (err) {
        console.error('Error saving asset:', err);
        setStatus(`Error saving asset: ${err.message}`);
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
    }
}

async function deleteRow(row, asset) {
    const confirmed = window.confirm(
        `Delete asset ${asset.InventoryNumber || asset.id}? This cannot be undone.`
    );
    if (!confirmed) return;

    row.querySelectorAll('button').forEach(btn => btn.disabled = true);

    try {
        const response = await fetch(`/assets/${asset.id}`, { method: 'DELETE' });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete asset');
        }

        allAssets = allAssets.filter(a => a.id !== asset.id);
        setStatus('Asset deleted.');
        renderPage(currentPage);
    } catch (err) {
        console.error('Error deleting asset:', err);
        setStatus(`Error deleting asset: ${err.message}`);
        row.querySelectorAll('button').forEach(btn => btn.disabled = false);
    }
}

function updatePaginationUI(totalPages) {
    const pageLabel = document.getElementById('page-label');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (pageLabel) pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function buildPaginationControls() {
    // Skip if already built (e.g. hot reload during dev)
    if (document.getElementById('pagination-controls')) return;

    const table = document.getElementById('review-table');
    if (!table) return;

    const container = document.createElement('div');
    container.id = 'pagination-controls';
    container.innerHTML = `
        <button id="prev-page" type="button">◀ Prev</button>
        <span id="page-label">Page 1 of 1</span>
        <button id="next-page" type="button">Next ▶</button>
    `;
    table.insertAdjacentElement('afterend', container);

    document.getElementById('prev-page').addEventListener('click', () => renderPage(currentPage - 1));
    document.getElementById('next-page').addEventListener('click', () => renderPage(currentPage + 1));
}

async function loadAssets() {
    setStatus('Loading assets...');
    try {
        const response = await fetch('/review');
        const assets = await response.json();

        if (!response.ok) {
            throw new Error(assets.error || 'Failed to load assets');
        }

        allAssets = Array.isArray(assets) ? assets : [];
        setStatus(allAssets.length ? '' : 'No assets found.');
        renderPage(1);
    } catch (err) {
        console.error('Error fetching assets:', err);
        setStatus(`Error fetching assets: ${err.message}`);
        allAssets = [];
        renderPage(1);
    }
}

function wireButtons() {
    const backBtn = document.getElementById('back-button');
    const clearBtn = document.getElementById('clear-button');
    const exportBtn = document.getElementById('export-button');

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '/index.html';
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            const confirmed = window.confirm('This will permanently delete all asset records. Are you sure?');
            if (!confirmed) return;

            clearBtn.disabled = true;
            setStatus('Clearing data...');
            try {
                const response = await fetch('/assets', { method: 'DELETE' });
                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to clear data');
                }

                setStatus('All data cleared.');
                await loadAssets();
            } catch (err) {
                console.error('Error clearing assets:', err);
                setStatus(`Error clearing data: ${err.message}`);
            } finally {
                clearBtn.disabled = false;
            }
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            exportBtn.disabled = true;
            setStatus('Exporting to TopDesk...');
            try {
                const response = await fetch('/export/topdesk', { method: 'POST' });
                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(result.error || 'Export failed');
                }

                setStatus('Export to TopDesk complete.');
            } catch (err) {
                console.error('Error exporting to TopDesk:', err);
                setStatus(`Error exporting: ${err.message}`);
            } finally {
                exportBtn.disabled = false;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    buildPaginationControls();
    wireButtons();
    loadAssets();
});