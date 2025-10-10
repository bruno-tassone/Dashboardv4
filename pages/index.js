
import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import * as XLSX from "xlsx";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from "recharts";

const COLORS = ['#2563eb','#10b981','#f97316'];

function parseWorkbookToJSON(workbook){
  const result = {};
  for(const sheetName of workbook.SheetNames){
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { header:1 });
    result[sheetName] = json;
  }
  return result;
}

function normalizeSheets(parsed){
  // parsed: sheetName -> rows (header row included)
  // Expect header row: first col 'Escola', next columns 'Semana X'
  const out = {};
  for(const [sheetName, rows] of Object.entries(parsed)){
    if(!rows || rows.length<2) continue;
    const headers = rows[0].map(h => h? String(h).trim() : "");
    const weekCols = headers.slice(1).map(h => {
      const m = String(h).match(/(\d+)/);
      return m? Number(m[1]) : null;
    });
    for(let r=1;r<rows.length;r++){
      const row = rows[r];
      const escola = row[0];
      if(!escola) continue;
      for(let j=1;j<row.length;j++){
        const sem = weekCols[j-1];
        if(sem==null) continue;
        const val = row[j];
        out[escola] = out[escola] || {};
        out[escola][sem] = out[escola][sem] || { Escola: escola, Semana: sem };
        out[escola][sem][sheetName] = (val===undefined || val===null) ? null : Number(val);
      }
    }
  }
  // Convert to escola -> sorted array
  const final = {};
  for(const [esc, obj] of Object.entries(out)){
    const arr = Object.values(obj).sort((a,b)=>a.Semana-b.Semana);
    final[esc]=arr;
  }
  return final;
}

export default function DashboardV4(){
  const [rawSheets, setRawSheets] = useState(null);
  const [dataBySchool, setDataBySchool] = useState(null);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [selectedMetrics, setSelectedMetrics] = useState(['Índice de exercícios','Acessos no período','Índice de acerto']);
  const [weekSelector, setWeekSelector] = useState(null); // numeric week
  const [status, setStatus] = useState('Nenhum arquivo carregado');
  const metricNames = ['Índice de exercícios','Acessos no período','Índice de acerto'];

  useEffect(()=>{
    // try load from localStorage if present
    try{
      const saved = localStorage.getItem('lovable_v4_data');
      if(saved){
        const obj = JSON.parse(saved);
        setRawSheets(obj.rawSheets);
        setStatus('Dados carregados do localStorage');
      }
    }catch(e){}
  },[]);

  useEffect(()=>{
    if(!rawSheets) return;
    const norm = normalizeSheets(rawSheets);
    setDataBySchool(norm);
    const schools = Object.keys(norm).sort();
    if(schools.length) setSelectedSchool(schools[0]);
    // set default week as last week available of first school
    if(schools.length){
      const first = norm[schools[0]];
      if(first && first.length) setWeekSelector(first[first.length-1].Semana);
    }
  },[rawSheets]);

  function handleFile(e){
    const f = e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
   reader.onload = (ev) => {
  try {
    const data = new Uint8Array(ev.target.result);
    const wb = XLSX.read(data, { type: 'array' });
        const parsed = parseWorkbookToJSON(wb);
        setRawSheets(parsed);
        localStorage.setItem('lovable_v4_data', JSON.stringify({ rawSheets: parsed }));
        setStatus(`Arquivo carregado: ${f.name}`);
      }catch(err){
        console.error(err); setStatus('Erro ao ler arquivo');
      }
    };
    reader.readAsArrayBuffer(f);
  }

  const schools = useMemo(()=> dataBySchool ? Object.keys(dataBySchool).sort() : [], [dataBySchool]);
  const timeseries = useMemo(()=> (selectedSchool && dataBySchool) ? dataBySchool[selectedSchool] : [], [selectedSchool,dataBySchool]);

  // Prepare data for charts
  const chartData = timeseries.map(row => ({
    Semana: row.Semana,
    Exercicios: row['Índice de exercícios'] ?? null,
    Acessos: row['Acessos no período'] ?? null,
    Acerto: row['Índice de acerto'] ?? null
  }));

  // Line data keys mapping for display
  const lineKeys = {
    'Índice de exercícios': 'Exercicios',
    'Acessos no período': 'Acessos',
    'Índice de acerto': 'Acerto'
  };

  function toggleMetric(metric){
    if(selectedMetrics.includes(metric)){
      setSelectedMetrics(selectedMetrics.filter(m=>m!==metric));
    } else {
      setSelectedMetrics([...selectedMetrics, metric]);
    }
  }

  // Pie data for selected week (or aggregate if weekSelector null)
  const pieData = useMemo(()=>{
    if(!timeseries || timeseries.length===0) return [];
    if(weekSelector!=null){
      const row = timeseries.find(r=>r.Semana===Number(weekSelector));
      if(!row) return [];
      return [
        {name:'Exercicios', value: row['Índice de exercícios'] ?? 0},
        {name:'Acessos', value: row['Acessos no período'] ?? 0},
        {name:'Acerto', value: row['Índice de acerto'] ?? 0},
      ];
    } else {
      // aggregate over period (sum)
      const agg = {Exercicios:0, Acessos:0, Acerto:0};
      for(const r of timeseries){
        agg.Exercicios += Number(r['Índice de exercícios'] ?? 0);
        agg.Acessos += Number(r['Acessos no período'] ?? 0);
        agg.Acerto += Number(r['Índice de acerto'] ?? 0);
      }
      return [
        {name:'Exercicios', value: agg.Exercicios},
        {name:'Acessos', value: agg.Acessos},
        {name:'Acerto', value: agg.Acerto},
      ];
    }
  },[timeseries,weekSelector]);

  return (
    <div className="container">
      <Head>
        <title>Dashboard Programação V3</title>
      </Head>

      <div className="card">
        <div className="header">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div className="badge">V3</div>
            <div>
              <div className="title">Dashboard Programação V3</div>
              <div style={{color:'#475569',fontSize:13}}>Visual colorido e didático — escolha escola e métricas</div>
            </div>
          </div>

          <div className="controls">
            <input className="file" type="file" accept=".xlsx,.xls" onChange={handleFile} />
            <div style={{padding:'6px 8px', borderRadius:8, background:'#f1f5f9', border:'1px solid #e6edf3'}}>{status}</div>
          </div>
        </div>

        <div className="grid">
          <div>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <select className="select" value={selectedSchool||''} onChange={e=>setSelectedSchool(e.target.value)}>
                <option value="">-- selecione a escola --</option>
                {schools.map(s=> <option key={s} value={s}>{s}</option>)}
              </select>

              <select className="select" value={weekSelector||''} onChange={e=>setWeekSelector(Number(e.target.value)||null)}>
                <option value="">Período: último</option>
                {timeseries.map(r=> <option key={r.Semana} value={r.Semana}>Semana {r.Semana}</option>)}
              </select>

              <div style={{marginLeft:8, color:'#64748b'}}>Selecionar métricas:</div>
              <div className="metrics">
                {metricNames.map(m=> (
                  <div key={m}
                    onClick={()=>toggleMetric(m)}
                    className={`metric-chip ${selectedMetrics.includes(m)?'active':''}`}
                    style={{borderColor: selectedMetrics.includes(m)?'#c7d2fe':'transparent', background: selectedMetrics.includes(m)?'#eef2ff':'transparent'}}>
                    {m}
                  </div>
                ))}
              </div>
            </div>

            <div style={{marginTop:12}} className="card">
              <div style={{fontWeight:700, marginBottom:8}}>Gráfico principal — Linhas (comparativo)</div>
              <div style={{width:'100%', height:360}}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="Semana" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {selectedMetrics.map((m,idx)=> (
                      <Line key={m} type="monotone" dataKey={lineKeys[m]} stroke={COLORS[idx%COLORS.length]} strokeWidth={2} dot={{r:3}} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12}}>
              {/* Bar charts - one per selected metric, but only show single metric in bar form */}
              {selectedMetrics.map((m, idx) => (
                <div key={'bar-'+m} className="card">
                  <div style={{fontWeight:700, marginBottom:8}}>{m} — Colunas</div>
                  <div style={{width:'100%', height:220}}>
                    <ResponsiveContainer>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="Semana" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey={lineKeys[m]} fill={COLORS[idx%COLORS.length]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="side">
            <div className="card">
              <div style={{fontWeight:700, marginBottom:8}}>Distribuição — {weekSelector?('Semana '+weekSelector):'Período'}</div>
              <div style={{width:'100%', height:240}}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {pieData.map((entry, index) => <Cell key={`c-${index}`} fill={COLORS[index%COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
                {pieData.map((p,i)=> <div key={'leg-'+i} style={{display:'flex',gap:8,alignItems:'center'}}><div style={{width:12,height:12,background:COLORS[i],borderRadius:3}}></div><div style={{fontSize:13}}>{p.name}: {Number(p.value).toFixed(2)}</div></div>)}
              </div>
            </div>

            <div className="card">
              <div style={{fontWeight:700, marginBottom:8}}>Resumo</div>
              <div style={{fontSize:13, color:'#475569'}}>
                <div>Métricas selecionadas: {selectedMetrics.join(', ') || '—'}</div>
                <div>Escola: {selectedSchool || '—'}</div>
                <div>Semana: {weekSelector || 'última'}</div>
                <div className="footer-note">Dica: para compartilhar os dados use o export do app (implementação opcional).</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
