import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import * as XLSX from "xlsx";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ReferenceLine, Label, Cell
} from "recharts";

const BASE_COLORS = {
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#facc15",
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
    const metaY =
      selectedMetric === "Índice de exercícios"
        ? 2
        : selectedMetric === "Índice de acerto"
        ? 70
        : 75;
    const atencaoY =
      selectedMetric === "Índice de exercícios"
        ? 1
        : selectedMetric === "Índice de acerto"
        ? 50
        : 50;

    return timeseries.map((row) => {
      const valor =
        selectedMetric === "Índice de exercícios"
          ? row["Índice de exercícios"] ?? 0
          : selectedMetric === "Acessos no período"
          ? row["Acessos no período"] ?? 0
          : row["Índice de acerto"] ?? 0;

      let cor = BASE_COLORS.red;
      if (valor >= metaY) cor = BASE_COLORS.green;
      else if (valor >= atencaoY) cor = BASE_COLORS.yellow;

      return {
        Semana: row.Semana,
        Exercicios: row["Índice de exercícios"] ?? 0,
        Acessos: row["Acessos no período"] ?? 0,
        Acerto: row["Índice de acerto"] ?? 0,
        Color: cor,
      };
    });
  }, [timeseries, selectedMetric]);

  const valorEhPercentual = selectedMetric === "Índice de acerto" || selectedMetric === "Acessos no período";

  const metaY =
    selectedMetric === "Índice de exercícios"
      ? 2
      : selectedMetric === "Índice de acerto"
      ? 70
      : 75;
  const atencaoY =
    selectedMetric === "Índice de exercícios"
      ? 1
      : selectedMetric === "Índice de acerto"
      ? 50
      : 50;

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
                Linhas de referência fixas e cores dinâmicas nos pontos
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

                    {/* Linha de meta */}
                    <ReferenceLine y={metaY} stroke={BASE_COLORS.green} strokeDasharray="5 5">
                      <Label value="Meta" position="right" fill={BASE_COLORS.green} fontSize={12} />
                    </ReferenceLine>

                    {/* Linha de atenção */}
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
          </div>
        )}
      </div>
    </div>
  );
}
