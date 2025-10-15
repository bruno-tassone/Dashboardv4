import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import * as XLSX from "xlsx";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Label
} from "recharts";

const BASE_COLORS = {
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#facc15",
  red: "#ef4444",
  gray: "#94a3b8",
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
        if (val === undefined || val === null || val === "" || isNaN(Number(val))) {
          val = 0;
        } else {
          val = Number(val);
        }
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
    "Índice de exercícios": "Índice de exercícios",
    "Acessos no período": "Acessos no período",
    "Índice de acerto": "Índice de acerto",
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

  const metaY =
    selectedMetric === "Índice de exercícios" ? 2 :
    selectedMetric === "Índice de acerto" ? 70 : 75;
  const atencaoY =
    selectedMetric === "Índice de exercícios" ? 1 : 50;

  const valorEhPercentual = selectedMetric === "Índice de acerto" || selectedMetric === "Acessos no período";

  const chartData = useMemo(() => {
    return timeseries.map((row) => {
      const valor = row[selectedMetric] ?? 0;
      let cor = BASE_COLORS.red;
      if (valor >= metaY) cor = BASE_COLORS.green;
      else if (valor >= atencaoY) cor = BASE_COLORS.yellow;

      return {
        Semana: row.Semana,
        "Índice de exercícios": row["Índice de exercícios"] ?? 0,
        "Acessos no período": row["Acessos no período"] ?? 0,
        "Índice de acerto": row["Índice de acerto"] ?? 0,
        Color: cor,
      };
    });
  }, [timeseries, selectedMetric]);

  // 🔹 Geração do ranking
  const ranking = useMemo(() => {
    if (!dataBySchool) return [];
    const lista = Object.entries(dataBySchool).map(([esc, arr]) => {
      const media = arr.reduce((s, r) => s + (r[selectedMetric] ?? 0), 0) / arr.length;
      return { escola: esc, media };
    });
    return lista.sort((a, b) => b.media - a.media);
  }, [dataBySchool, selectedMetric]);

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
                Linhas de referência fixas, tabela e ranking dinâmico
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

        {timeseries.length > 0 && (
          <>
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <select className="select" value={selectedSchool || ""} onChange={(e) => setSelectedSchool(e.target.value)}>
                  <option value="">-- selecione a escola --</option>
                  {schools.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select className="select" value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)}>
                  {metricNames.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* 🔹 Gráfico principal */}
              <div style={{ marginTop: 16 }} className="card">
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {selectedMetric} — Tendência
                </div>
                <div style={{ width: "100%", height: 400 }}>
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
                      <ReferenceLine y={metaY} stroke={BASE_COLORS.green} strokeDasharray="5 5">
                        <Label value="Meta" position="right" fill={BASE_COLORS.green} fontSize={12} />
                      </ReferenceLine>
                      <ReferenceLine y={atencaoY} stroke={BASE_COLORS.yellow} strokeDasharray="5 5">
                        <Label value="Atenção" position="right" fill={BASE_COLORS.yellow} fontSize={12} />
                      </ReferenceLine>
                      <Line
                        type="monotone"
                        dataKey={lineKeys[selectedMetric]}
                        stroke={BASE_COLORS.blue}
                        strokeWidth={3}
                        dot={({ cx, cy, payload }) => (
                          <circle cx={cx} cy={cy} r={6} fill={payload.Color} stroke="#fff" strokeWidth={2} />
                        )}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

             {/* 🔹 Tabela de dados — formato novo */}
<div className="card" style={{ marginTop: 24 }}>
  <div style={{ fontWeight: 700, marginBottom: 8 }}>Tabela — Semana a Semana</div>

  <div style={{ overflowX: "auto" }}>
    <table style={{ borderCollapse: "collapse", minWidth: "700px" }}>
      <thead>
        <tr style={{ background: "#f1f5f9", textAlign: "center" }}>
          <th style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>Indicador</th>
          {chartData.map((r) => (
            <th key={r.Semana} style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>
              {r.Semana}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[
          { nome: "Índice de exercícios", meta: 2, atencao: 1 },
          { nome: "Acessos no período", meta: 75, atencao: 50 },
          { nome: "Índice de acerto", meta: 70, atencao: 50 },
        ].map((indicador) => (
          <tr key={indicador.nome} style={{ textAlign: "center" }}>
            <td
              style={{
                padding: "8px 12px",
                border: "1px solid #e2e8f0",
                fontWeight: "600",
                background: "#f8fafc",
              }}
            >
              {indicador.nome}
            </td>
            {chartData.map((r, i) => {
              const valor = r[indicador.nome] ?? 0;
              const cor = getColor(valor, indicador.meta, indicador.atencao);
              const exib = indicador.nome === "Índice de exercícios"
                ? valor.toFixed(2)
                : `${valor.toFixed(1)}%`;
              return (
                <td
                  key={i}
                  style={{
                    border: "1px solid #e2e8f0",
                    background: cor,
                    color: "black",
                    padding: 6,
                    fontWeight: 600,
                    width: 45,
                    height: 45,
                    textAlign: "center",
                    borderRadius: 6,
                  }}
                >
                  {exib}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

              {/* 🔹 Ranking das Escolas */}
{dataBySchool && (
  <div className="card" style={{ marginTop: 24 }}>
    <div style={{ fontWeight: 700, marginBottom: 8 }}>
      Ranking de Escolas — {selectedMetric}
    </div>

    {(() => {
      // Monta média por escola para o indicador atual
      const ranking = Object.entries(dataBySchool)
        .map(([esc, dados]) => {
          const valores = dados.map((r) => Number(r[selectedMetric] ?? 0));
          const media = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
          return { escola: esc, media };
        })
        .sort((a, b) => b.media - a.media);

      const ehPercentual =
        selectedMetric === "Acessos no período" || selectedMetric === "Índice de acerto";

      return (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>Posição</th>
              <th style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>Escola</th>
              <th style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>Média</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((item, i) => {
              const destaque = item.escola === selectedSchool;
              return (
                <tr
                  key={item.escola}
                  style={{
                    background: destaque ? "#dbeafe" : i % 2 === 0 ? "#ffffff" : "#f8fafc",
                    fontWeight: destaque ? "700" : "normal",
                    color: destaque ? "#1e3a8a" : "#0f172a",
                  }}
                >
                  <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>
                    {destaque ? "🔹 " : ""}
                    {item.escola}
                  </td>
                  <td style={{ padding: "8px 12px", border: "1px solid #e2e8f0" }}>
                    {ehPercentual
                      ? `${item.media.toFixed(1)}%`
                      : item.media.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    })()}
  </div>
)}

  function getColor(valor, meta, atencao) {
    if (valor >= meta) return BASE_COLORS.green;
    if (valor >= atencao) return BASE_COLORS.yellow;
    return BASE_COLORS.red;
  }
}
