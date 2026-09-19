const state = { rows: [], columns: [], filters: {}, chart: null, fileName: '' };
const $ = id => document.getElementById(id);
const empty = v => v === undefined || v === null || String(v).trim() === '';
const number = v => { const n = Number(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const format = n => new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n);

function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && next === '\n') i++; row.push(cell.trim()); if (row.some(x => x !== '')) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell.trim()); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}
function infer(values) { const existing = values.filter(v => !empty(v)); if (!existing.length) return 'Empty'; return existing.every(v => number(v) !== null) ? 'Number' : 'Text'; }
function numericValues(col) { return state.rows.map(r => number(r[col])).filter(v => v !== null); }
function filteredRows() { return state.rows.filter(r => Object.entries(state.filters).every(([c, value]) => !value || String(r[c]).toLowerCase().includes(value.toLowerCase()))); }
function render() {
  const cells = state.rows.length * state.columns.length;
  const missing = state.rows.reduce((sum,r) => sum + state.columns.filter(c => empty(r[c])).length, 0);
  $('recordCount').textContent = format(state.rows.length); $('columnCount').textContent = format(state.columns.length);
  $('missingCount').textContent = format(missing); $('missingRate').textContent = `${cells ? ((missing / cells) * 100).toFixed(1) : 0}% of all cells`;
  $('completeness').textContent = `${cells ? (100 - missing / cells * 100).toFixed(1) : 0}%`;
  $('qualityBody').innerHTML = state.columns.map(c => { const m = state.rows.filter(r => empty(r[c])).length, good = state.rows.length ? 100 - m / state.rows.length * 100 : 0; return `<tr><td>${escapeHTML(c)}</td><td><span class="type-pill">${infer(state.rows.map(r=>r[c]))}</span></td><td class="right">${format(m)} <span class="subtle">(${state.rows.length ? (m/state.rows.length*100).toFixed(1):0}%)</span></td><td><span class="progress"><i style="width:${good}%"></i></span><span class="subtle">${good.toFixed(1)}%</span></td></tr>`; }).join('');
  const numeric = state.columns.filter(c => infer(state.rows.map(r => r[c])) === 'Number');
  $('statsBody').innerHTML = numeric.length ? numeric.map(c => { const v=numericValues(c), avg=v.reduce((a,b)=>a+b,0)/v.length; return `<tr><td>${escapeHTML(c)}</td><td class="right">${format(avg)}</td><td class="right">${format(Math.min(...v))}</td><td class="right">${format(Math.max(...v))}</td></tr>`; }).join('') : '<tr><td colspan="4" class="empty">No numeric columns were detected.</td></tr>';
  setupChartOptions(numeric); renderCorrelation(numeric); renderFilters(); renderPreview();
}
function setupChartOptions(numeric) {
  const category = $('categoryColumn'), value = $('valueColumn'); const oldC=category.value, oldV=value.value;
  category.innerHTML = state.columns.map(c=>`<option value="${escapeAttr(c)}">${escapeHTML(c)}</option>`).join('');
  value.innerHTML = numeric.map(c=>`<option value="${escapeAttr(c)}">${escapeHTML(c)}</option>`).join('') || '<option value="">Count of records</option>';
  category.value = state.columns.includes(oldC) ? oldC : state.columns[0]; value.value = numeric.includes(oldV) ? oldV : (numeric[0] || ''); renderChart();
}
function renderChart() {
  if (!state.rows.length || !window.Chart) return; const c=$('categoryColumn').value,v=$('valueColumn').value,type=$('chartType').value;
  const groups={}; filteredRows().forEach(r=>{const k=empty(r[c])?'(blank)':r[c]; groups[k]=(groups[k]||[]).concat(v?number(r[v]):1);});
  const entries=Object.entries(groups).map(([label,values])=>[label, v ? values.filter(x=>x!==null).reduce((a,b)=>a+b,0) : values.length]).sort((a,b)=>b[1]-a[1]).slice(0,12);
  if(state.chart)state.chart.destroy(); state.chart=new Chart($('mainChart'),{type,data:{labels:entries.map(x=>x[0]),datasets:[{label:v?`Total ${v}`:'Records',data:entries.map(x=>x[1]),backgroundColor:type==='doughnut'?['#9b8cff','#4ce2c1','#ffbc5f','#ff6d85','#6ba8ff','#c58cff','#83d87a']:'#9b8cff',borderRadius:5,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:type==='doughnut',labels:{color:'#c9cede'}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${format(ctx.raw)}`}}},scales:type==='doughnut'?{}:{x:{ticks:{color:'#9399ab'},grid:{display:false}},y:{ticks:{color:'#9399ab'},grid:{color:'#292d3a'},beginAtZero:true}}}});
}
function pearson(a,b) { const pairs=state.rows.map(r=>[number(r[a]),number(r[b])]).filter(x=>x[0]!==null&&x[1]!==null); if(pairs.length<2)return null; const ax=pairs.reduce((s,x)=>s+x[0],0)/pairs.length,by=pairs.reduce((s,x)=>s+x[1],0)/pairs.length; const top=pairs.reduce((s,[x,y])=>s+(x-ax)*(y-by),0), bottom=Math.sqrt(pairs.reduce((s,[x])=>s+(x-ax)**2,0)*pairs.reduce((s,[,y])=>s+(y-by)**2,0));return bottom?top/bottom:null; }
function renderCorrelation(numeric) { if(numeric.length<2){$('correlationContent').innerHTML='<p class="empty">Add at least two numeric columns to see a correlation matrix.</p>';return;} $('correlationContent').innerHTML=`<table class="correlation-table"><thead><tr><th></th>${numeric.map(c=>`<th>${escapeHTML(c)}</th>`).join('')}</tr></thead><tbody>${numeric.map(a=>`<tr><th>${escapeHTML(a)}</th>${numeric.map(b=>{const v=pearson(a,b), alpha=v===null?0:Math.abs(v)*.8+.08, color=v>=0?`rgba(76,226,193,${alpha})`:`rgba(255,109,133,${alpha})`;return `<td style="background:${color};color:${Math.abs(v||0)>.55?'#080b10':'#e8e9f0'}">${v===null?'—':v.toFixed(2)}</td>`}).join('')}</tr>`).join('')}</tbody></table>`; }
function renderFilters(){ $('filterControls').innerHTML=state.columns.slice(0,5).map(c=>`<label>${escapeHTML(c)}<input data-filter="${escapeAttr(c)}" value="${escapeAttr(state.filters[c]||'')}" placeholder="Filter…"></label>`).join(''); document.querySelectorAll('[data-filter]').forEach(i=>i.addEventListener('input',e=>{state.filters[e.target.dataset.filter]=e.target.value;renderPreview();renderChart();})); }
function renderPreview(){ const rows=filteredRows(); $('filterResult').textContent=`Showing ${format(rows.length)} of ${format(state.rows.length)} records`; $('previewHead').innerHTML=`<tr>${state.columns.map(c=>`<th>${escapeHTML(c)}</th>`).join('')}</tr>`; $('previewBody').innerHTML=rows.slice(0,100).map(r=>`<tr>${state.columns.map(c=>`<td>${empty(r[c])?'<span class="subtle">—</span>':escapeHTML(r[c])}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${state.columns.length}" class="empty">No records match these filters.</td></tr>`; }
function escapeHTML(v){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));} function escapeAttr(v){return escapeHTML(v);}
function loadFile(file){const reader=new FileReader();reader.onload=()=>{const raw=parseCSV(reader.result);if(raw.length<2){alert('Please choose a CSV with a header row and at least one data row.');return;}state.columns=raw[0].map((c,i)=>c||`Column ${i+1}`);state.rows=raw.slice(1).map(r=>Object.fromEntries(state.columns.map((c,i)=>[c,r[i]||''])));state.fileName=file.name;state.filters={};$('uploadState').hidden=true;$('dashboard').hidden=false;$('datasetName').textContent=file.name;$('loadInfo').textContent=`${format(state.rows.length)} rows · loaded locally`;render();};reader.readAsText(file);}
function loadSample(){const raw=parseCSV(`Student ID,Department,Hours Studied,Attendance,Assessment Score,Project Score,Final Score\nSIWES-001,Data Science,18,92,78,88,83\nSIWES-002,Data Science,25,97,89,94,91\nSIWES-003,Computer Science,12,76,61,72,66\nSIWES-004,Data Science,22,90,83,91,87\nSIWES-005,Statistics,15,84,70,75,73\nSIWES-006,Computer Science,28,99,95,97,96\nSIWES-007,Statistics,10,68,55,,60\nSIWES-008,Data Science,20,93,81,86,84\nSIWES-009,Computer Science,16,82,67,79,72\nSIWES-010,Statistics,24,95,90,89,91`);state.columns=raw[0];state.rows=raw.slice(1).map(r=>Object.fromEntries(state.columns.map((c,i)=>[c,r[i]||''])));state.fileName='siwes-sample-data.csv';state.filters={};$('uploadState').hidden=true;$('dashboard').hidden=false;$('datasetName').textContent='SIWES sample data';$('loadInfo').textContent=`${format(state.rows.length)} rows · built-in sample`;render();}
const dropZone=$('uploadState');['dragenter','dragover'].forEach(event=>dropZone.addEventListener(event,e=>{e.preventDefault();dropZone.classList.add('drag-active');}));['dragleave','drop'].forEach(event=>dropZone.addEventListener(event,e=>{e.preventDefault();dropZone.classList.remove('drag-active');}));dropZone.addEventListener('drop',e=>{const file=[...e.dataTransfer.files].find(f=>f.name.toLowerCase().endsWith('.csv'));if(file)loadFile(file);else alert('Please drop a CSV file.');});$('sampleButton').addEventListener('click',loadSample);$('fileInput').addEventListener('change',e=>e.target.files[0]&&loadFile(e.target.files[0]));$('replaceFile').addEventListener('click',()=>$('fileInput').click());$('chartType').addEventListener('change',renderChart);$('categoryColumn').addEventListener('change',renderChart);$('valueColumn').addEventListener('change',renderChart);$('downloadButton').addEventListener('click',()=>{const data=[state.columns,...filteredRows().map(r=>state.columns.map(c=>`"${String(r[c]).replace(/"/g,'""')}"`))].map(r=>r.join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'text/csv'}));a.download='filtered-'+state.fileName;a.click();URL.revokeObjectURL(a.href);});
