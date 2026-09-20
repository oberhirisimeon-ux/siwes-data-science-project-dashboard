const state = { rows: [], columns: [], filters: {}, chart: null, fileName: '', excelWorkbook: null, excelFileName: '' };
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
  if (!state.rows.length || !window.Chart) return;
  const c=$('categoryColumn').value,v=$('valueColumn').value,type=$('chartType').value,aggregation=$('aggregation').value,rows=filteredRows();
  const aggregate=values=>{const nums=values.filter(x=>x!==null);if(aggregation==='count')return values.length;if(!nums.length)return 0;if(aggregation==='sum')return nums.reduce((a,b)=>a+b,0);if(aggregation==='average')return nums.reduce((a,b)=>a+b,0)/nums.length;if(aggregation==='min')return Math.min(...nums);return Math.max(...nums);};
  let config, hint='';
  if(type==='scatter'){
    const points=rows.map(r=>({x:number(r[c]),y:number(r[v])})).filter(p=>p.x!==null&&p.y!==null).slice(0,500);
    hint='Scatter plots need two numeric columns: X axis and Y axis.';
    config={type:'scatter',data:{datasets:[{label:`${v} by ${c}`,data:points,backgroundColor:'#4ce2c1',pointRadius:5,pointHoverRadius:7}]},options:{...chartOptions(false),scales:{x:{title:{display:true,text:c,color:'#9399ab'},ticks:{color:'#9399ab'},grid:{color:'#292d3a'}},y:{title:{display:true,text:v,color:'#9399ab'},ticks:{color:'#9399ab'},grid:{color:'#292d3a'}}}}};
  } else if(type==='histogram') {
    const values=rows.map(r=>number(r[v])).filter(x=>x!==null),min=Math.min(...values),max=Math.max(...values),bins=8,width=(max-min||1)/bins,counts=Array(bins).fill(0); values.forEach(x=>counts[Math.min(bins-1,Math.floor((x-min)/width))]++); const labels=counts.map((_,i)=>`${format(min+i*width)}–${format(min+(i+1)*width)}`);
    hint='A histogram shows how frequently values occur across ranges.';
    config={type:'bar',data:{labels,datasets:[{label:`Frequency of ${v}`,data:counts,backgroundColor:'#9b8cff',borderRadius:4,borderWidth:0}]},options:chartOptions(false)};
  } else {
    const groups={};rows.forEach(r=>{const k=empty(r[c])?'(blank)':r[c];(groups[k]??=[]).push(number(r[v]));}); const entries=Object.entries(groups).map(([label,values])=>[label,aggregate(values)]).sort((a,b)=>b[1]-a[1]).slice(0,12);
    hint=`Showing ${aggregation} of ${v||'records'} grouped by ${c}.`;
    config={type,data:{labels:entries.map(x=>x[0]),datasets:[{label:`${aggregation} of ${v||'records'}`,data:entries.map(x=>x[1]),backgroundColor:type==='doughnut'?['#9b8cff','#4ce2c1','#ffbc5f','#ff6d85','#6ba8ff','#c58cff','#83d87a']:'#9b8cff',borderColor:'#4ce2c1',borderWidth:type==='line'?2:0,borderRadius:type==='bar'?5:0,fill:false,tension:.3}]},options:chartOptions(type==='doughnut')};
  }
  $('chartHint').textContent=hint;if(state.chart)state.chart.destroy();state.chart=new Chart($('mainChart'),config);
}
function chartOptions(isDonut){return {responsive:true,maintainAspectRatio:false,plugins:{legend:{display:isDonut,labels:{color:'#c9cede'}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${format(ctx.raw?.y??ctx.raw)}`}}},scales:isDonut?{}:{x:{ticks:{color:'#9399ab'},grid:{display:false}},y:{ticks:{color:'#9399ab'},grid:{color:'#292d3a'},beginAtZero:true}}};}
function pearson(a,b) { const pairs=state.rows.map(r=>[number(r[a]),number(r[b])]).filter(x=>x[0]!==null&&x[1]!==null); if(pairs.length<2)return null; const ax=pairs.reduce((s,x)=>s+x[0],0)/pairs.length,by=pairs.reduce((s,x)=>s+x[1],0)/pairs.length; const top=pairs.reduce((s,[x,y])=>s+(x-ax)*(y-by),0), bottom=Math.sqrt(pairs.reduce((s,[x])=>s+(x-ax)**2,0)*pairs.reduce((s,[,y])=>s+(y-by)**2,0));return bottom?top/bottom:null; }
function renderCorrelation(numeric) { if(numeric.length<2){$('correlationContent').innerHTML='<p class="empty">Add at least two numeric columns to see a correlation matrix.</p>';return;} $('correlationContent').innerHTML=`<table class="correlation-table"><thead><tr><th></th>${numeric.map(c=>`<th>${escapeHTML(c)}</th>`).join('')}</tr></thead><tbody>${numeric.map(a=>`<tr><th>${escapeHTML(a)}</th>${numeric.map(b=>{const v=pearson(a,b), alpha=v===null?0:Math.abs(v)*.8+.08, color=v>=0?`rgba(76,226,193,${alpha})`:`rgba(255,109,133,${alpha})`;return `<td style="background:${color};color:${Math.abs(v||0)>.55?'#080b10':'#e8e9f0'}">${v===null?'—':v.toFixed(2)}</td>`}).join('')}</tr>`).join('')}</tbody></table>`; }
function renderFilters(){ $('filterControls').innerHTML=state.columns.slice(0,5).map(c=>`<label>${escapeHTML(c)}<input data-filter="${escapeAttr(c)}" value="${escapeAttr(state.filters[c]||'')}" placeholder="Filter…"></label>`).join(''); document.querySelectorAll('[data-filter]').forEach(i=>i.addEventListener('input',e=>{state.filters[e.target.dataset.filter]=e.target.value;renderPreview();renderChart();saveDashboard();})); }
function renderPreview(){ const rows=filteredRows(); $('filterResult').textContent=`Showing ${format(rows.length)} of ${format(state.rows.length)} records`; $('previewHead').innerHTML=`<tr>${state.columns.map(c=>`<th>${escapeHTML(c)}</th>`).join('')}</tr>`; $('previewBody').innerHTML=rows.slice(0,100).map(r=>`<tr>${state.columns.map(c=>`<td>${empty(r[c])?'<span class="subtle">—</span>':escapeHTML(r[c])}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${state.columns.length}" class="empty">No records match these filters.</td></tr>`; }
function escapeHTML(v){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));} function escapeAttr(v){return escapeHTML(v);}
$('aggregation').addEventListener('change',renderChart);
$('uploadState').addEventListener('drop',e=>{e.preventDefault();e.stopImmediatePropagation();$('uploadState').classList.remove('drag-active');const file=[...e.dataTransfer.files].find(f=>/\.(csv|xlsx|xls)$/i.test(f.name));if(file)loadFile(file);else alert('Please drop a CSV, XLSX, or XLS file.');},true);
function dashboardSettings(){return {chartType:$('chartType').value,categoryColumn:$('categoryColumn').value,valueColumn:$('valueColumn').value,aggregation:$('aggregation').value};}
function saveDashboard(){if(!state.rows.length)return;try{localStorage.setItem('siwes-dashboard-v1',JSON.stringify({columns:state.columns,rows:state.rows,fileName:state.fileName,filters:state.filters,settings:dashboardSettings()}));$('saveStatus').textContent='Latest dashboard saved on this device';}catch(error){$('saveStatus').textContent='Dataset is too large to save in this browser';}}
function applySettings(settings={}){for(const [id,value] of Object.entries(settings)){const control=$(id);if(control&&[...control.options].some(o=>o.value===value))control.value=value;}renderChart();}
function setDataset(raw,fileName,source='loaded locally') { if(raw.length<2){alert('Please choose a file with a header row and at least one data row.');return;}state.columns=raw[0].map((c,i)=>String(c||`Column ${i+1}`));state.rows=raw.slice(1).map(r=>Object.fromEntries(state.columns.map((c,i)=>[c,r[i]??''])));state.fileName=fileName;state.filters={};$('uploadState').hidden=true;$('dashboard').hidden=false;$('datasetName').textContent=fileName;$('loadInfo').textContent=`${format(state.rows.length)} rows · ${source}`;render();saveDashboard(); }
function restoreSavedDashboard(){try{const saved=JSON.parse(localStorage.getItem('siwes-dashboard-v1'));if(!saved?.rows?.length||!saved?.columns?.length)return;state.columns=saved.columns;state.rows=saved.rows;state.fileName=saved.fileName||'Saved dashboard';state.filters=saved.filters||{};$('uploadState').hidden=true;$('dashboard').hidden=false;$('datasetName').textContent=state.fileName;$('loadInfo').textContent=`${format(state.rows.length)} rows · restored from this browser`;render();applySettings(saved.settings);$('saveStatus').textContent='Latest dashboard restored from this device';}catch(error){localStorage.removeItem('siwes-dashboard-v1');}}
['chartType','categoryColumn','valueColumn','aggregation'].forEach(id=>$(id).addEventListener('change',saveDashboard));
$('clearSavedDashboard').addEventListener('click',()=>{localStorage.removeItem('siwes-dashboard-v1');state.rows=[];state.columns=[];state.filters={};if(state.chart)state.chart.destroy();$('dashboard').hidden=true;$('uploadState').hidden=false;$('fileInput').value='';});
$('sampleButton').addEventListener('click',()=>setTimeout(saveDashboard,0));
$('sampleButton').addEventListener('click',()=>{state.excelWorkbook=null;state.excelFileName='';$('excelSheetControls').hidden=true;});
$('sheetSelector').addEventListener('change',e=>loadExcelSheet(e.target.value));
$('clearSavedDashboard').addEventListener('click',()=>{state.excelWorkbook=null;state.excelFileName='';$('excelSheetControls').hidden=true;});
restoreSavedDashboard();
function loadExcelSheet(sheetName){if(!state.excelWorkbook)return;const raw=XLSX.utils.sheet_to_json(state.excelWorkbook.Sheets[sheetName],{header:1,defval:''});setDataset(raw,state.excelFileName,`Excel sheet: ${sheetName}`);}
function loadFile(file){const extension=file.name.split('.').pop().toLowerCase();if(extension==='csv'){state.excelWorkbook=null;state.excelFileName='';$('excelSheetControls').hidden=true;const reader=new FileReader();reader.onload=()=>setDataset(parseCSV(reader.result),file.name);reader.readAsText(file);return;}if(!['xlsx','xls'].includes(extension)){alert('Please choose a CSV, XLSX, or XLS file.');return;}if(!window.XLSX){alert('The Excel reader did not load. Please refresh and try again.');return;}file.arrayBuffer().then(buffer=>{state.excelWorkbook=XLSX.read(buffer);state.excelFileName=file.name;const selector=$('sheetSelector');selector.innerHTML=state.excelWorkbook.SheetNames.map(name=>`<option value="${escapeAttr(name)}">${escapeHTML(name)}</option>`).join('');$('excelSheetControls').hidden=false;selector.value=state.excelWorkbook.SheetNames[0];loadExcelSheet(selector.value);}).catch(()=>alert('This Excel file could not be read. Please try another file.'));}
function loadSample(){const raw=parseCSV(`Student ID,Department,Hours Studied,Attendance,Assessment Score,Project Score,Final Score\nSIWES-001,Data Science,18,92,78,88,83\nSIWES-002,Data Science,25,97,89,94,91\nSIWES-003,Computer Science,12,76,61,72,66\nSIWES-004,Data Science,22,90,83,91,87\nSIWES-005,Statistics,15,84,70,75,73\nSIWES-006,Computer Science,28,99,95,97,96\nSIWES-007,Statistics,10,68,55,,60\nSIWES-008,Data Science,20,93,81,86,84\nSIWES-009,Computer Science,16,82,67,79,72\nSIWES-010,Statistics,24,95,90,89,91`);state.columns=raw[0];state.rows=raw.slice(1).map(r=>Object.fromEntries(state.columns.map((c,i)=>[c,r[i]||''])));state.fileName='siwes-sample-data.csv';state.filters={};$('uploadState').hidden=true;$('dashboard').hidden=false;$('datasetName').textContent='SIWES sample data';$('loadInfo').textContent=`${format(state.rows.length)} rows · built-in sample`;render();}
const dropZone=$('uploadState');['dragenter','dragover'].forEach(event=>dropZone.addEventListener(event,e=>{e.preventDefault();dropZone.classList.add('drag-active');}));['dragleave','drop'].forEach(event=>dropZone.addEventListener(event,e=>{e.preventDefault();dropZone.classList.remove('drag-active');}));dropZone.addEventListener('drop',e=>{const file=[...e.dataTransfer.files].find(f=>f.name.toLowerCase().endsWith('.csv'));if(file)loadFile(file);else alert('Please drop a CSV file.');});$('sampleButton').addEventListener('click',loadSample);$('fileInput').addEventListener('change',e=>e.target.files[0]&&loadFile(e.target.files[0]));$('replaceFile').addEventListener('click',()=>$('fileInput').click());$('chartType').addEventListener('change',renderChart);$('categoryColumn').addEventListener('change',renderChart);$('valueColumn').addEventListener('change',renderChart);$('downloadButton').addEventListener('click',()=>{const data=[state.columns,...filteredRows().map(r=>state.columns.map(c=>`"${String(r[c]).replace(/"/g,'""')}"`))].map(r=>r.join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'text/csv'}));a.download='filtered-'+state.fileName;a.click();URL.revokeObjectURL(a.href);});
