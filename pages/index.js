import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import * as XLSX from "xlsx";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar
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
        let val = row[j];

        if(val === undefined || val === null || val === "" || isNaN(Number(val))) {
          val = 0;
        } else {
          val = Number(val);
        }

        // ✅ Ajuste: multiplicar por 100 se for percentual
        if (['Índice de acerto', 'Acessos no período'].includes(sheetName)) {
          val = val * 100;
        }

        out[escola] = out[escola] || {};
        out[escola][sem] = out[escola][sem] || { Escola: escola, Semana: sem };
        out[escola][sem][sheetName] = val;
      }
    }
  }

  // Converter para formato final
  const final = {};
  for(const [esc, obj] of Object.entries(out)){
    const arr = Object.values(obj).sort((a,b)=>a.Semana-b.Semana);
    final[esc]=arr;
  }
  return final;
}

export default function DashboardV5(){
  const [rawSheets, setRawSheets] = useState(null);
  const [dataBySchool, setDataBySchool] = useState(null);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState('Índice de exercícios');
  const [status, setStatus] = useState('Nenhum arquivo carregado');
  const [selectedRankingMetric, setSelectedRankingMetric] = useState('Índice de exercícios');

  const metricNames = ['Índice de exercícios','Acessos no período','Índice de acerto'];
  const lineKeys = {
    'Índice de exercícios': 'Exercicios',
    'Acessos no período': 'Acessos',
    'Índice de acerto': 'Acerto'
  };

  useEffect(()=>{
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
  },[rawSheets]);

  function handleFile(e){
    const f = e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try{
        const wb = XLSX.read(ev.target.result, {type:'binary'});
        const parsed = parseWorkbookToJSON(wb);
        setRawSheets(parsed);
        localStorage.setItem('lovable_v4_data', JSON.stringify({ rawSheets: parsed }));
        setStatus(`Arquivo carregado: ${f.name}`);
      }catch(err){
        console.error(err); setStatus('Erro ao ler arquivo');
      }
    };
    reader.readAsBinaryString(f);
  }

  const schools = useMemo(()=> dataBySchool ? Object.keys(dataBySchool).sort() : [], [dataBySchool]);
  const timeseries = useMemo(()=> (selectedSchool && dataBySchool) ? dataBySchool[selectedSchool] : [], [selectedSchool,dataBySchool]);

  const chartData = useMemo(()=> timeseries.map(row => ({
    Semana: row.Semana,
    Exercicios: row['Índice de exercícios'] ?? 0,
    Acessos: row['Acessos no período'] ?? 0,
    Acerto: row['Índice de acerto'] ?? 0
  })), [timeseries]);

  // calcular média acumulada
  const mediaAcumulada = useMemo(()=>{
    if(!timeseries.length) return 0;
    const key = selectedMetric;
    const vals = timeseries.map(r=> Number(r[key] ?? 0));
    const sum = vals.reduce((a,b)=>a+b,0);
    return sum / vals.length;
  },[timeseries,selectedMetric]);

  // ranking
  const rankingData = useMemo(() => {
    if (!dataBySchool) return [];
    const arr = Object.entries(dataBySchool).map(([school, rows]) => {
      const vals = rows.map(r => Number(r[selectedRankingMetric] ?? 0));
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return { school, avg };
    });
    arr.sort((a, b) => b.avg - a.avg);
    return arr;
  }, [dataBySchool, selectedRankingMetric]);

  const valorEhPercentual = selectedMetric === 'Índice de acerto' || selectedMetric === 'Acessos no período';

  return (
    <div className="container" style={{ padding: 20 }}>
      <Head><title>Dashboard Programação V5</title></Head>

      <div className="card" style={{ padding: 20, background: 'white', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div className="header">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div className="badge" style={{background:'#2563eb',color:'white',padding:'4px 8px',borderRadius:8,fontWeight:700}}>V5</div>
            <div>
              <div className="title" style={{fontSize:22,fontWeight:700}}>Dashboard Programação V5</div>
              <div style={{color:'#475569',fontSize:13}}>Escolha escola e métrica principal</div>
            </div>
          </div>

          {/* Upload e Ranking */}
          <div className="controls" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
              <input className="file" type="file" accept=".xlsx,.xls" onChange={handleFile} />
              <div style={{ padding: '6px 8px', borderRadius: 8, background: '#f1f5f9', border:'1px solid #e6edf3' }}>
                {status}
              </div>
            </div>

            {/* 🔹 Ranking das escolas */}
            <div style={{ width: '100%', display: 'flex', gap: 12 }}>
              <div style={{
                minWidth: 280,
                maxWidth: 360,
                background: '#f8fafc',
                border: '1px solid #e6edf0',
                borderRadius: 10,
                padding: 12,
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>🏫 Ranking de Escolas</div>

                <select
                  className="select"
                  value={selectedRankingMetric}
                  onChange={(e) => setSelectedRankingMetric(e.target.value)}
                  style={{ width: '100%', marginBottom: 8 }}
                >
                  {metricNames.map(m => <option key={m} value={m}>{m}</option>)}
                </select>

                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {rankingData.length === 0 && <div style={{ color:'#64748b' , fontSize:13 }}>Nenhum dado carregado</div>}
                  {rankingData.map((r, idx) => (
                    <div key={r.school} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 0',
                      borderBottom: '1px solid #eef2f6',
                      fontSize: 13
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, width: 22, textAlign: 'right', color: idx < 3 ? '#2563eb' : '#475569' }}>{idx + 1}.</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{r.school}</span>
                      </div>
                      <div style={{ fontWeight: 700, color: idx === 0 ? '#16a34a' : idx === rankingData.length - 1 ? '#dc2626' : '#475569' }}>
                        {r.avg.toFixed(1)}{selectedRankingMetric !== 'Índice de exercícios' ? '%' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }} />
            </div>
          </div>
        </div>

        {/* Seleção de escola e métrica */}
        <div className="grid" style={{ marginTop: 20 }}>
          <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <select className="select" value={selectedSchool||''} onChange={e=>setSelectedSchool(e.target.value)}>
              <option value="">-- selecione a escola --</option>
              {schools.map(s=> <option key={s} value={s}>{s}</option>)}
            </select>

            <select className="select" value={selectedMetric} onChange={e=>setSelectedMetric(e.target.value)}>
              {metricNames.map(m=> <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Gráfico de Linhas */}
          <div style={{marginTop:16}} className="card">
            <div style={{fontWeight:700, marginBottom:8}}>
              {selectedMetric} — Gráfico de Linhas
            </div>
            <div style={{width:'100%', height:380}}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="Semana" />
                  <YAxis domain={valorEhPercentual ? [0, 100] : ['auto', 'auto']} tickFormatter={valorEhPercentual ? (v=>`${v}%`) : undefined}/>
                  <Tooltip formatter={(v)=> valorEhPercentual ? `${v}%` : v}/>
                  <Legend />
                  <Line type="monotone"
                        dataKey={lineKeys[selectedMetric]}
                        stroke={COLORS[0]}
                        strokeWidth={3}
                        dot={{r:3}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico de Colunas */}
          <div className="card" style={{marginTop:16}}>
            <div style={{fontWeight:700, marginBottom:8}}>
              {selectedMetric} — Gráfico de Colunas
            </div>
            <div style={{width:'100%', height:280}}>
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="Semana" />
                  <YAxis domain={valorEhPercentual ? [0, 100] : ['auto', 'auto']} tickFormatter={valorEhPercentual ? (v=>`${v}%`) : undefined}/>
                  <Tooltip formatter={(v)=> valorEhPercentual ? `${v}%` : v}/>
                  <Bar dataKey={lineKeys[selectedMetric]} fill={COLORS[1]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Média acumulada */}
          <div className="card" style={{marginTop:16}}>
            <div style={{fontWeight:700}}>Média acumulada</div>
            <div style={{fontSize:22, fontWeight:600, color:'#2563eb', marginTop:4}}>
              {valorEhPercentual ? `${mediaAcumulada.toFixed(1)}%` : mediaAcumulada.toFixed(2)}
            </div>
            <div style={{fontSize:13, color:'#64748b'}}>Média das semanas para a métrica selecionada</div>
          </div>
        </div>
      </div>
    </div>
  );
}
