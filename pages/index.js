import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import * as XLSX from "xlsx";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Label, BarChart, Bar, Cell
} from "recharts";

const BASE_COLORS = {
  blue: "#2563eb",
  green: "#10b981",
  yellow: "#facc15",
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

  // 🔹 Definir linha verde e amarela conforme métrica
  const linhaVerde = useMemo(() => {
    if (selectedMetric === "Índice de exercícios") return 2;
    if (selectedMetric === "Acessos no período") return 75;
    if (selectedMetric === "Índice de acerto") return 70;
    return 0;
  }, [selectedMetric]);

  const linhaAmarela = useMemo(() => {
    if (selectedMetric === "Índice de exercícios") return 1;
    if (selectedMetric === "Acessos no período") return 50;
    if (selectedMetric === "Índice de acerto") return 50;
    return 0;
  }, [selectedMetric]);

  const chartData = useMemo(() => {
    return timeseries.map((row) => {
      const valor = row[selectedMetric] ?? 0;
      let cor = BASE_COLORS.red;
      if (valor >= linhaVerde) cor = BASE_COLORS.green;
      else if (valor >= linhaAmarela) cor = BASE_COLORS.yellow;
      return {
        Semana: row.Semana,
        Exercicios: row["Índice de exercícios"] ?? 0,
        Acessos: row["Acessos no período"] ?? 0,
        Acerto: row["Índice de acerto"] ?? 0,
        Valor: valor,
        Color: cor
      };
    });
  }, [timeseries, selectedMetric, linhaVerde, linhaAmarela]);

  const valorEhPercentual =
    selectedMetric === "Índice de acerto" || selectedMetric === "Acessos no período";

  // 🔹 Ranking das escolas
  const ranking = useMemo(() => {
    if (!dataBySchool) return [];
    const arr = Object.entries(dataBySchool).map(([escola, dados]) => {
      const vals = dados.map((d) => Number(d[selectedMetric] ?? 0));
      const media = vals.reduce((a, b) => a + b, 0) / vals.length;
      return { escola, media };
    });
    return arr.sort((a, b) => b.media - a.media);
  }, [dataBySchool, selectedMetric]);

  // 🔹 Função cor na tabela
  function getColor(valor, meta, atencao) {
    if (valor >= meta) return BASE_COLORS.green;
    if (valor >= atencao) return BASE_COLORS.yellow;
    return BASE_COLORS.red;
  }

  return (
    <div className="container">
      <Head>
        <title>Dashboard Programação V8</title>
      </Head>

      <div className="card">
        <div className="header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="badge">V8</div>
            <div>
              <div className="title">Dashboard Programação V8</div>
              <div style={{ color: "#475569", fontSize: 13 }}>
                Linhas de meta fixas e cores dinâmicas
              </div>
            </div>
          </div>
          <div className="controls">
            <input className="file" type="file" accept=".xlsx,.xls" onChange={handleFile} />
            <div
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                background: "#f1f5f9",
                border: "1px solid #e6edf3"
              }}
            >
              {status}
            </div>
          </div>
        </div>

        {timeseries.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {selectedMetric} — Gráfico de Linhas
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
                  <Tooltip
                    formatter={(v) =>
                      valorEhPercentual ? `${v.toFixed(1)}%` : v.toFixed(2)
                    }
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey={lineKeys[selectedMetric]}
                    stroke={BASE_COLORS.blue}
                    strokeWidth={3}
                    dot={({ cx, cy, payload }) => (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill={payload.Color}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    )}
                  />
                  <ReferenceLine
                    y={linhaVerde}
                    stroke={BASE_COLORS.green}
                    strokeDasharray="4 4"
                  >
                    <Label value="Meta" position="right" fill={BASE_COLORS.green} fontSize={12} />
                  </ReferenceLine>
                  <ReferenceLine
                    y={linhaAmarela}
                    stroke={BASE_COLORS.yellow}
                    strokeDasharray="4 4"
                  >
                    <Label
                      value="Atenção"
                      position="right"
                      fill={BASE_COLORS.yellow}
                      fontSize={12}
                    />
                  </ReferenceLine>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 🔹 Tabela de informações */}
        {timeseries.length > 0 && (
          <div className="card" style={{ marginTop: 20, overflowX: "auto" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Dados da instituição — {selectedSchool}
            </div>
            <table style={{ borderCollapse: "collapse", minWidth: "900px" }}>
              <thead>
                <tr>
                  <th style={{ padding: 6, textAlign: "center" }}>Indicador</th>
                  {timeseries.map((t) => (
                    <th key={t.Semana} style={{ padding: 6 }}>S{t.Semana}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricNames.map((m) => {
                  const meta =
                    m === "Índice de exercícios" ? 2 : m === "Acessos no período" ? 75 : 70;
                  const atencao =
                    m === "Índice de exercícios" ? 1 : m === "Acessos no período" ? 50 : 50;
                  return (
                    <tr key={m}>
                      <td style={{ fontWeight: 600, padding: 6 }}>{m}</td>
                      {timeseries.map((t) => {
                        const valor = t[m] ?? 0;
                        const cor = getColor(valor, meta, atencao);
                        return (
                          <td
                            key={t.Semana}
                            style={{
                              padding: 4,
                              textAlign: "center",
                              background: cor,
                              color: "black",
                              borderRadius: 6
                            }}
                          >
                            {valorEhPercentual ? `${valor.toFixed(1)}%` : valor.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 🔹 Ranking das escolas */}
        {ranking.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Ranking das escolas — {selectedMetric}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 6 }}>#</th>
                  <th style={{ textAlign: "left", padding: 6 }}>Escola</th>
                  <th style={{ textAlign: "center", padding: 6 }}>Média</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr
                    key={r.escola}
                    style={{
                      background:
                        r.escola === selectedSchool ? "#e0f2fe" : "transparent",
                      fontWeight: r.escola === selectedSchool ? 700 : 400
                    }}
                  >
                    <td style={{ padding: 6 }}>{i + 1}</td>
                    <td style={{ padding: 6 }}>{r.escola}</td>
                    <td style={{ textAlign: "center", padding: 6 }}>
                      {valorEhPercentual ? `${r.media.toFixed(1)}%` : r.media.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
