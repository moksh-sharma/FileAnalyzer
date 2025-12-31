// Data Analyzer Pro - Flask Backend Version
// API-based data analysis with Python processing

const API_BASE = '';

// Global state
let fileId = null;
let columns = [];
let numericColumns = [];
let categoricalColumns = [];
let currentPage = 1;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupFileUpload();
    setupPagination();
    setupAnalysisButtons();
});

// Navigation
function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (link.classList.contains('disabled')) return;

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            const section = link.dataset.section;
            document.getElementById(`${section}-section`).classList.add('active');
        });
    });
}

// File Upload
function setupFileUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
        dropZone.addEventListener(event, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    ['dragenter', 'dragover'].forEach(event => {
        dropZone.addEventListener(event, () => dropZone.classList.add('drag-over'));
    });

    ['dragleave', 'drop'].forEach(event => {
        dropZone.addEventListener(event, () => dropZone.classList.remove('drag-over'));
    });

    dropZone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file) uploadFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadFile(file);
    });
}

async function uploadFile(file) {
    const validExtensions = ['.csv', '.txt'];
    const extension = '.' + file.name.split('.').pop().toLowerCase();

    if (!validExtensions.includes(extension)) {
        showToast('Please upload a CSV or TXT file', 'error');
        return;
    }

    document.getElementById('drop-zone').classList.add('hidden');
    document.getElementById('upload-progress').classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}/api/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        fileId = data.file_id;
        columns = data.column_names;

        // Get column info
        await fetchColumnInfo();

        // Enable navigation
        enableNavigation();

        // Populate overview
        populateOverview(data);

        // Fetch statistics
        await fetchStatistics();

        // Populate select dropdowns
        populateSelects();

        // Navigate to overview
        document.querySelector('[data-section="overview"]').click();

        showToast(`File loaded successfully! ${data.rows} rows, ${data.columns} columns`, 'success');
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
        document.getElementById('drop-zone').classList.remove('hidden');
        document.getElementById('upload-progress').classList.add('hidden');
    } finally {
        showLoading(false);
    }
}

async function fetchColumnInfo() {
    try {
        const response = await fetch(`${API_BASE}/api/columns/${fileId}`);
        const data = await response.json();

        numericColumns = data.columns.filter(c => c.is_numeric).map(c => c.name);
        categoricalColumns = data.columns.filter(c => !c.is_numeric).map(c => c.name);
    } catch (error) {
        console.error('Error fetching column info:', error);
    }
}

function enableNavigation() {
    document.querySelectorAll('.nav-link.disabled').forEach(link => {
        link.classList.remove('disabled');
    });
}

// Overview
function populateOverview(data) {
    document.getElementById('file-name').textContent = data.filename;
    document.getElementById('total-rows').textContent = data.rows.toLocaleString();
    document.getElementById('total-cols').textContent = data.columns;
    document.getElementById('memory-usage').textContent = data.memory_usage;

    // Render preview from initial data
    renderInitialPreview(data.preview, data.column_names);

    // Render column info
    renderColumnInfo(data.column_names, data.column_types);

    // Set up pagination for full preview
    currentPage = 1;
    fetchDataPreview();
}

function renderInitialPreview(preview, columnNames) {
    const thead = document.querySelector('#data-preview-table thead');
    const tbody = document.querySelector('#data-preview-table tbody');

    thead.innerHTML = '<tr>' + columnNames.map(col => `<th>${col}</th>`).join('') + '</tr>';

    tbody.innerHTML = preview.map(row =>
        '<tr>' + columnNames.map(col => `<td>${row[col] ?? ''}</td>`).join('') + '</tr>'
    ).join('');
}

async function fetchDataPreview() {
    try {
        const response = await fetch(`${API_BASE}/api/data-preview/${fileId}?page=${currentPage}&per_page=50`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error);
        }

        const thead = document.querySelector('#data-preview-table thead');
        const tbody = document.querySelector('#data-preview-table tbody');

        thead.innerHTML = '<tr>' + columns.map(col => `<th>${col}</th>`).join('') + '</tr>';

        tbody.innerHTML = data.data.map(row =>
            '<tr>' + columns.map(col => `<td>${row[col] ?? ''}</td>`).join('') + '</tr>'
        ).join('');

        document.getElementById('page-info').textContent = `Page ${data.page} of ${data.total_pages}`;
    } catch (error) {
        console.error('Error fetching preview:', error);
    }
}

function renderColumnInfo(columnNames, columnTypes) {
    const container = document.getElementById('column-info');

    container.innerHTML = columnNames.map(col => {
        const dtype = columnTypes[col];
        const isNumeric = dtype.includes('int') || dtype.includes('float');

        return `
            <div class="column-item">
                <span class="column-type ${isNumeric ? 'numeric' : 'categorical'}">${isNumeric ? 'Numeric' : 'Categorical'}</span>
                <span class="column-name">${col}</span>
                <span class="column-dtype">${dtype}</span>
            </div>
        `;
    }).join('');
}

// Pagination
function setupPagination() {
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchDataPreview();
        }
    });

    document.getElementById('next-page').addEventListener('click', () => {
        currentPage++;
        fetchDataPreview();
    });
}

// Statistics
async function fetchStatistics() {
    try {
        const response = await fetch(`${API_BASE}/api/basic-stats/${fileId}`);
        const stats = await response.json();

        if (!response.ok) {
            throw new Error(stats.error);
        }

        renderNumericStats(stats.numeric_stats);
        renderCategoricalStats(stats.categorical_stats);
        renderQualitySummary(stats);
    } catch (error) {
        console.error('Error fetching statistics:', error);
    }
}

function renderNumericStats(numericStats) {
    const thead = document.querySelector('#numeric-stats-table thead');
    const tbody = document.querySelector('#numeric-stats-table tbody');

    if (!numericStats || Object.keys(numericStats).length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No numeric columns found</td></tr>';
        return;
    }

    thead.innerHTML = '<tr><th>Column</th><th>Count</th><th>Mean</th><th>Std</th><th>Min</th><th>25%</th><th>50%</th><th>75%</th><th>Max</th></tr>';

    const columns = Object.keys(numericStats);
    tbody.innerHTML = columns.map(col => {
        const s = numericStats[col];
        return `
            <tr>
                <td><strong>${col}</strong></td>
                <td>${formatNumber(s.count)}</td>
                <td>${formatNumber(s.mean)}</td>
                <td>${formatNumber(s.std)}</td>
                <td>${formatNumber(s.min)}</td>
                <td>${formatNumber(s['25%'])}</td>
                <td>${formatNumber(s['50%'])}</td>
                <td>${formatNumber(s['75%'])}</td>
                <td>${formatNumber(s.max)}</td>
            </tr>
        `;
    }).join('');
}

function renderCategoricalStats(catStats) {
    const container = document.getElementById('categorical-stats');

    if (!catStats || Object.keys(catStats).length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted)">No categorical columns found</p>';
        return;
    }

    container.innerHTML = Object.entries(catStats).map(([col, stats]) => {
        const topValues = Object.entries(stats.top_values).slice(0, 5);
        const maxCount = topValues[0]?.[1] || 1;

        return `
            <div class="categorical-item">
                <h4><i class="fas fa-tag"></i> ${col}</h4>
                <p class="unique-count">${stats.unique_count} unique values</p>
                ${topValues.map(([value, count]) => `
                    <div class="value-bar">
                        <span class="value-name">${value}</span>
                        <div class="value-bar-fill"><span style="width:${(count / maxCount) * 100}%"></span></div>
                        <span class="value-count">${count}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
}

function renderQualitySummary(stats) {
    const container = document.getElementById('quality-summary');

    const totalMissing = Object.values(stats.missing_values).reduce((a, b) => a + b, 0);
    const totalCells = stats.shape.rows * stats.shape.columns;
    const missingPercent = ((totalMissing / totalCells) * 100).toFixed(2);

    container.innerHTML = `
        <div class="quality-item">
            <i class="fas fa-check-circle ${stats.duplicates === 0 ? 'success' : 'warning'}"></i>
            <div>
                <h4>Duplicate Rows</h4>
                <p>${stats.duplicates} (${stats.duplicate_percentage}%)</p>
            </div>
        </div>
        <div class="quality-item">
            <i class="fas fa-question-circle ${totalMissing === 0 ? 'success' : 'warning'}"></i>
            <div>
                <h4>Missing Values</h4>
                <p>${totalMissing.toLocaleString()} (${missingPercent}%)</p>
            </div>
        </div>
        <div class="quality-item">
            <i class="fas fa-hashtag"></i>
            <div>
                <h4>Numeric Columns</h4>
                <p>${stats.numeric_columns.length}</p>
            </div>
        </div>
        <div class="quality-item">
            <i class="fas fa-font"></i>
            <div>
                <h4>Categorical Columns</h4>
                <p>${stats.categorical_columns.length}</p>
            </div>
        </div>
    `;
}

// Populate selects
function populateSelects() {
    // Distribution - all columns
    populateSelect('dist-column', columns);

    // Scatter - numeric only
    populateSelect('scatter-x', numericColumns);
    populateSelect('scatter-y', numericColumns);

    // Scatter hue - categorical
    const scatterHue = document.getElementById('scatter-hue');
    scatterHue.innerHTML = '<option value="">None</option>' +
        categoricalColumns.map(col => `<option value="${col}">${col}</option>`).join('');

    // GroupBy
    populateSelect('groupby-col', columns);
    populateSelect('agg-col', numericColumns);
}

function populateSelect(id, options) {
    const select = document.getElementById(id);
    if (select) {
        select.innerHTML = options.map(col => `<option value="${col}">${col}</option>`).join('');
    }
}

// Analysis buttons
function setupAnalysisButtons() {
    document.getElementById('generate-dist').addEventListener('click', generateDistribution);
    document.getElementById('generate-scatter').addEventListener('click', generateScatter);
    document.getElementById('generate-correlation').addEventListener('click', generateCorrelation);
    document.getElementById('generate-pairplot').addEventListener('click', generatePairPlot);
    document.getElementById('analyze-missing').addEventListener('click', analyzeMissing);
    document.getElementById('detect-outliers').addEventListener('click', detectOutliers);
    document.getElementById('run-groupby').addEventListener('click', runGroupBy);
}

// Visualizations (using Python backend)
async function generateDistribution() {
    const col = document.getElementById('dist-column').value;
    if (!col) return;

    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}/api/distribution/${fileId}/${encodeURIComponent(col)}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        document.getElementById('dist-result').innerHTML = `
            <div class="chart-container">
                <img src="${data.chart}" alt="Distribution of ${col}" style="max-width:100%; border-radius:8px;">
            </div>
            <div class="stats-summary">
                ${data.stats.type === 'numeric' ? `
                    <div class="stats-row">
                        <span>Mean: ${formatNumber(data.stats.mean)}</span>
                        <span>Median: ${formatNumber(data.stats.median)}</span>
                        <span>Std Dev: ${formatNumber(data.stats.std)}</span>
                    </div>
                    <div class="stats-row">
                        <span>Min: ${formatNumber(data.stats.min)}</span>
                        <span>Max: ${formatNumber(data.stats.max)}</span>
                        <span>Outliers: ${data.stats.outliers_count} (${data.stats.outliers_percentage}%)</span>
                    </div>
                    <div class="stats-row">
                        <span>Skewness: ${formatNumber(data.stats.skewness)}</span>
                        <span>Kurtosis: ${formatNumber(data.stats.kurtosis)}</span>
                    </div>
                ` : `
                    <div class="stats-row">
                        <span>Unique Values: ${data.stats.unique}</span>
                        <span>Top Value: ${data.stats.top_value}</span>
                        <span>Top Frequency: ${data.stats.top_frequency}</span>
                    </div>
                `}
            </div>
        `;
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function generateScatter() {
    const xCol = document.getElementById('scatter-x').value;
    const yCol = document.getElementById('scatter-y').value;
    const hueCol = document.getElementById('scatter-hue').value;

    if (!xCol || !yCol) return;

    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}/api/scatter/${fileId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x_column: xCol, y_column: yCol, hue_column: hueCol || null })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        document.getElementById('scatter-result').innerHTML = `
            <div class="chart-container">
                <img src="${data.chart}" alt="Scatter plot" style="max-width:100%; border-radius:8px;">
            </div>
            ${data.correlation !== null ? `
                <div class="correlation-badge">
                    <i class="fas fa-link"></i> Correlation: <strong>${data.correlation}</strong>
                </div>
            ` : ''}
        `;
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function generateCorrelation() {
    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}/api/correlation/${fileId}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        let strongCorrHtml = '';
        if (data.strong_correlations && data.strong_correlations.length > 0) {
            strongCorrHtml = `
                <div class="strong-correlations">
                    <h4><i class="fas fa-link"></i> Strong Correlations (|r| > 0.5)</h4>
                    <ul>
                        ${data.strong_correlations.map(c => `
                            <li>
                                <span class="corr-pair">${c.col1} ↔ ${c.col2}</span>
                                <span class="corr-value ${c.correlation > 0 ? 'positive' : 'negative'}">${c.correlation}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        document.getElementById('correlation-result').innerHTML = `
            <div class="chart-container">
                <img src="${data.heatmap}" alt="Correlation Heatmap" style="max-width:100%; border-radius:8px;">
            </div>
            ${strongCorrHtml}
        `;
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function generatePairPlot() {
    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}/api/pairplot/${fileId}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        document.getElementById('pairplot-result').innerHTML = `
            <div class="chart-container">
                <img src="${data.chart}" alt="Pair Plot" style="max-width:100%; border-radius:8px;">
            </div>
            <p class="helper-text">Columns used: ${data.columns_used.join(', ')}</p>
        `;
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Analysis
async function analyzeMissing() {
    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}/api/missing-analysis/${fileId}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        if (data.total_missing === 0) {
            document.getElementById('missing-result').innerHTML = `
                <div class="empty-state success">
                    <i class="fas fa-check-circle"></i>
                    <h4>No Missing Values!</h4>
                    <p>Your dataset is complete.</p>
                </div>
            `;
            return;
        }

        document.getElementById('missing-result').innerHTML = `
            <div class="missing-summary">
                <div class="missing-stat">
                    <span class="missing-value">${data.total_missing.toLocaleString()}</span>
                    <span class="missing-label">Total Missing Values</span>
                </div>
                <div class="missing-stat">
                    <span class="missing-value">${data.total_missing_percentage}%</span>
                    <span class="missing-label">Missing Percentage</span>
                </div>
            </div>
            <div class="chart-container">
                <img src="${data.chart}" alt="Missing Values Analysis" style="max-width:100%; border-radius:8px;">
            </div>
        `;
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function detectOutliers() {
    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}/api/outliers/${fileId}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        const outlierInfo = data.outlier_info;
        const hasOutliers = Object.values(outlierInfo).some(o => o.count > 0);

        if (!hasOutliers) {
            document.getElementById('outliers-result').innerHTML = `
                <div class="empty-state success">
                    <i class="fas fa-check-circle"></i>
                    <h4>No Outliers Detected</h4>
                    <p>All values are within expected ranges (IQR method).</p>
                </div>
            `;
            return;
        }

        document.getElementById('outliers-result').innerHTML = `
            ${data.chart ? `
                <div class="chart-container">
                    <img src="${data.chart}" alt="Outlier Detection" style="max-width:100%; border-radius:8px;">
                </div>
            ` : ''}
            <div class="outlier-grid">
                ${Object.entries(outlierInfo).filter(([_, o]) => o.count > 0).map(([col, o]) => `
                    <div class="outlier-item">
                        <h5>${col}</h5>
                        <p><i class="fas fa-exclamation-triangle"></i> ${o.count} outliers (${o.percentage}%)</p>
                        <p><small>Bounds: [${formatNumber(o.lower_bound)}, ${formatNumber(o.upper_bound)}]</small></p>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function runGroupBy() {
    const groupCol = document.getElementById('groupby-col').value;
    const aggCol = document.getElementById('agg-col').value;
    const aggFunc = document.getElementById('agg-func').value;

    if (!groupCol || !aggCol) return;

    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}/api/groupby/${fileId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_column: groupCol, value_column: aggCol, aggregation: aggFunc })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        document.getElementById('groupby-result').innerHTML = `
            <div class="chart-container">
                <img src="${data.chart}" alt="Group By Analysis" style="max-width:100%; border-radius:8px;">
            </div>
            <div class="groupby-table">
                <table class="data-table">
                    <thead><tr><th>${groupCol}</th><th>${aggFunc}(${aggCol})</th></tr></thead>
                    <tbody>
                        ${Object.entries(data.data).slice(0, 20).map(([key, val]) => `
                            <tr><td>${key}</td><td>${formatNumber(val)}</td></tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Helper functions
function formatNumber(num) {
    if (num === null || num === undefined) return '-';
    if (typeof num !== 'number') return num;
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// Toast notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.4s ease reverse';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}
