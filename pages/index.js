import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import * as XLSX from "xlsx";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ReferenceLine, Label, Cell
} from "recharts";

const BASE_COLORS = {
  blue: "#2563eb",
  green: "#10b981",
  orange: "#f97316",
  red: "#ef4444",
  gray: "#94a3b8"
};

function parseWorkbookToJSON(workbook) {
  const result = {};
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    result[sheetName] = json;
  }
  return result;
}

function normalizeSheets(parsed) {
  const out = {};
  for (const [sheetName, rows] of Object.entries(parsed)) {
    if (!rows || rows.length < 2) continue;
    const headers = rows[0].map(h => (h ? String(h).trim() : ""));
    const weekCols = headers.slice(1).map(h => {
      const m = String(h).match(/(\d+)/);
      return m ? Number(m[1]) : null;
    });
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const escola = row[0];
      if (!escola) continue;
      for (let j = 1; j < row.length; j++) {
        const sem = weekCols[j - 1];
        if (sem == null) continue;
        let val = row[j];

        // Células em branco → 0
        if (val === undefined || val === null || val === "" || isNaN(Number(val))) {
          val = 0;
        } else {
          val = Number(val);
        }

        // Corrigir porcentagens (0.45 → 45)
        if (["Índice de acerto", "Acessos no período"].includes(sheetName) && val <= 1) {
          val = val * 100;
        }

        out[escola] = out[escola] || {};
        out[escola][sem] = out[escola][sem] || { Escola: escola, Semana: sem };
        out[escola][sem][sheetName] = val;
      }
    }
  }

  const final = {};
  for (const [esc, obj] of Object.entries(out)) {
    const arr = Object.values(obj).sort((a, b) => a.Semana - b.Semana);
    final[esc] = arr;
  }
  return final;
}

export default function DashboardV8() {
  const [rawSheets, setRawSheets] = useState(null);
  const [dataBySchool, setDataBySchool] = useState(null);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState("Índice de exercícios");
  const [status, setStatus] = useState("Nenhum arquivo carregado");

  const metricNames = ["Índice de exercícios", "Acessos no período", "Índice de acerto"];
  const lineKeys = {
    "Índice de exercícios": "Exercicios",
    "Acessos no período": "Acessos",
    "Índice de acerto": "Acerto"
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lovable_v4_data");
      if (saved) {
        const obj = JSON.parse(saved);
        setRawSheets(obj.rawSheets);
        setStatus("Dados carregados do localStorage");
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!rawSheets) return;
    const norm = normalizeSheets(rawSheets);
    setDataBySchool(norm);
    const schools = Object.keys(norm).sort();
    if (schools.length) setSelectedSchool(schools[0]);
  }, [rawSheets]);

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const parsed = parseWorkbookToJSON(wb);
        setRawSheets(parsed);
        localStorage.setItem("lovable_v4_data", JSON.stringify({ rawSheets: parsed }));
        setStatus(`Arquivo carregado: ${f.name}`);
      } catch (err) {
        console.error(err);
        setStatus("Erro ao ler arquivo");
      }
    };
    reader.readAsBinaryString(f);
  }

  const schools = useMemo(() => (dataBySchool ? Object.keys(dataBySchool).sort() : []), [dataBySchool]);
  const timeseries = useMemo(() => (selectedSchool && dataBySchool ? dataBySchool[selectedSchool] : []), [selectedSchool, dataBySchool]);

  const chartData = useMemo(() => {
    const arr = timeseries.map((row, i) => {
      const prev = i > 0 ? timeseries[i - 1] : null;
      const diff = prev ? row[selectedMetric] - prev[selectedMetric] : 0;
      let cor = BASE_COLORS.gray;
      if (diff > 0.01) cor = BASE_COLORS.green;
      else if (diff < -0.01) cor = BASE_COLORS.red;
      return {
        Semana: row.Semana,
        Exercicios: row["Índice de exercícios"] ?? 0,
        Acessos: row["Acessos no período"] ?? 0,
        Acerto: row["Índice de acerto"] ?? 0,
        Color: cor
      };
    });
    return arr;
  }, [timeseries, selectedMetric]);

  const mediaAcumulada = useMemo(() => {
    if (!timeseries.length) return 0;
    const vals = timeseries.map((r) => Number(r[selectedMetric] ?? 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    return sum / vals.length;
  }, [timeseries, selectedMetric]);

// 🔹 Cálculo do ranking geral
const [selectedRankingMetric, setSelectedRankingMetric] = useState('Índice de exercícios');

const rankingData = useMemo(() => {
  if (!dataBySchool) return [];
  const rankingArr = Object.entries(dataBySchool).map(([school, rows]) => {
    const vals = rows.map(r => Number(r[selectedRankingMetric] ?? 0));
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { school, avg };
  });
  rankingArr.sort((a, b) => b.avg - a.avg);
  return rankingArr;
}, [dataBySchool, selectedRankingMetric]);

  
  const valorEhPercentual = selectedMetric === "Índice de acerto" || selectedMetric === "Acessos no período";

  // 🔹 Cálculo do indicador de tendência geral
  const tendencia = useMemo(() => {
    if (!timeseries.length) return { texto: "Sem dados", cor: BASE_COLORS.gray, emoji: "⚪" };
    const ultimo = timeseries[timeseries.length - 1][selectedMetric];
    const diff = ultimo - mediaAcumulada;
    const diffPct = (diff / mediaAcumulada) * 100;
    if (diffPct > 2)
      return { texto: `Em alta (+${diffPct.toFixed(1)}%)`, cor: BASE_COLORS.green, emoji: "🔺" };
    if (diffPct < -2)
      return { texto: `Em queda (${diffPct.toFixed(1)}%)`, cor: BASE_COLORS.red, emoji: "🔻" };
    return { texto: "Estável (na média)", cor: BASE_COLORS.gray, emoji: "⚪" };
  }, [timeseries, mediaAcumulada, selectedMetric]);

  return (
    <div className="container">
      <Head><title>Dashboard Programação V8</title></Head>

      <div className="card">
        <div className="header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="badge">V8</div>
            <div>
              <div className="title">Dashboard Programação V8</div>
              <div style={{ color: "#475569", fontSize: 13 }}>
                Cores dinâmicas, média acumulada e indicador de tendência
              </div>
            </div>
          </div>

          <div className="controls">
            <input className="file" type="file" accept=".xlsx,.xls" onChange={handleFile} />
            <div style={{ padding: "6px 8px", borderRadius: 8, background: "#f1f5f9", border: "1px solid #e6edf3" }}>
              {status}
            </div>
          </div>
        </div>

        {/* 🔹 Indicador de tendência geral */}
        {timeseries.length > 0 && (
          <div className="card" style={{ marginTop: 12, border: `2px solid ${tendencia.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28 }}>{tendencia.emoji}</span>
              <div>
                <div style={{ fontWeight: 700, color: tendencia.cor }}>
                  {tendencia.texto}
                </div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  Comparando a última semana com a média acumulada
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
  <select className="select" value={selectedSchool || ""} onChange={(e) => setSelectedSchool(e.target.value)}>
    <option value="">-- selecione a escola --</option>
    {schools.map((s) => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>

{/* 🔹 Painel de Ranking à Direita */}
<div style={{
  position: 'absolute',
  right: 24,
  top: 120,
  width: 280,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: 16,
  boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
}}>
  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>🏫 Ranking de Escolas</div>
  
  <select
    className="select"
    value={selectedRankingMetric}
    onChange={(e) => setSelectedRankingMetric(e.target.value)}
    style={{ width: '100%', marginBottom: 8 }}
  >
    {metricNames.map(m => (
      <option key={m} value={m}>{m}</option>
    ))}
  </select>

  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
    {rankingData.map((r, idx) => (
      <div key={r.school} style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '1px solid #e2e8f0',
        fontSize: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, width: 22, textAlign: 'right', color: idx < 3 ? '#2563eb' : '#475569' }}>
            {idx + 1}.
          </span>
          <span>{r.school}</span>
        </div>
        <div style={{ fontWeight: 700, color: idx === 0 ? '#16a34a' : idx === rankingData.length - 1 ? '#dc2626' : '#475569' }}>
          {r.avg.toFixed(1)}{selectedRankingMetric !== 'Índice de exercícios' ? '%' : ''}
        </div>
      </div>
    ))}
  </div>
</div>

    
  <select className="select" value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)}>
    {metricNames.map((m) => (
      <option key={m} value={m}>{m}</option>
    ))}
  </select>

  {/* 🔹 Título + seta de tendência */}
  {selectedSchool && timeseries.length > 0 && (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontWeight: 700,
      fontSize: 18,
      color: tendencia.cor,
      marginLeft: 12
    }}>
      <span style={{ fontSize: 22 }}>{tendencia.emoji}</span>
      <span>{selectedSchool}</span>
    </div>
  )}
</div>

            {/* 🔹 Gráfico de Linhas */}
            <div style={{ marginTop: 16 }} className="card">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {selectedMetric} — Tendência
              </div>
              <div style={{ width: "100%", height: 380 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="Semana" />
                    <YAxis
                      domain={valorEhPercentual ? [0, 100] : ["auto", "auto"]}
                      tickFormatter={valorEhPercentual ? (v) => `${v}%` : undefined}
                    />
                    <Tooltip formatter={(v) => (valorEhPercentual ? `${v.toFixed(1)}%` : v.toFixed(2))} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey={lineKeys[selectedMetric]}
                      stroke={BASE_COLORS.blue}
                      strokeWidth={3}
                      dot={({ cx, cy, payload }) => (
                        <circle cx={cx} cy={cy} r={5} fill={payload.Color} stroke="#fff" strokeWidth={2} />
                      )}
                    />
                    <ReferenceLine
                      y={mediaAcumulada}
                      stroke={BASE_COLORS.red}
                      strokeDasharray="3 3"
                    >
                      <Label value="Média acumulada" position="right" fill={BASE_COLORS.red} fontSize={12} />
                    </ReferenceLine>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 🔹 Gráfico de Colunas */}
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {selectedMetric} — Comparativo semanal
              </div>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="Semana" />
                    <YAxis
                      domain={valorEhPercentual ? [0, 100] : ["auto", "auto"]}
                      tickFormatter={valorEhPercentual ? (v) => `${v}%` : undefined}
                    />
                    <Tooltip formatter={(v) => (valorEhPercentual ? `${v.toFixed(1)}%` : v.toFixed(2))} />
                    <Bar dataKey={lineKeys[selectedMetric]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.Color} />
                      ))}
                    </Bar>
                    <ReferenceLine
                      y={mediaAcumulada}
                      stroke={BASE_COLORS.red}
                      strokeDasharray="3 3"
                    >
                      <Label value="Média acumulada" position="right" fill={BASE_COLORS.red} fontSize={12} />
                    </ReferenceLine>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 🔹 Valor numérico da média */}
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700 }}>Média acumulada</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: BASE_COLORS.blue, marginTop: 4 }}>
                {valorEhPercentual ? `${mediaAcumulada.toFixed(1)}%` : mediaAcumulada.toFixed(2)}
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Média das semanas para a métrica selecionada
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
