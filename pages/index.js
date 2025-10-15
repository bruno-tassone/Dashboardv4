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
  lightBlue: "#dbeafe"
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
        // if percentages are provided as 0.45 convert to 45
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

  const metricNames = [
    "Índice de exercícios",
    "Acessos no período",
    "Índice de acerto"
  ];

  // read saved on load
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

  const schools = useMemo(
    () => (dataBySchool ? Object.keys(dataBySchool).sort() : []),
    [dataBySchool]
  );

  const timeseries = useMemo(
    () => (selectedSchool && dataBySchool ? dataBySchool[selectedSchool] : []),
    [selectedSchool, dataBySchool]
  );

  // linha verde (meta) e linha amarela (atenção)
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

  // chart data with Color per point
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

  // ranking (media por escola para indicador selecionado)
  const ranking = useMemo(() => {
    if (!dataBySchool) return [];
    const arr = Object.entries(dataBySchool).map(([escola, dados]) => {
      const vals = dados.map((d) => Number(d[selectedMetric] ?? 0));
      const media = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return { escola, media };
    });
    return arr.sort((a, b) => b.media - a.media);
  }, [dataBySchool, selectedMetric]);

  // helper used in table for color
  function getColor(valor, meta, atencao) {
    if (valor >= meta) return BASE_COLORS.green;
    if (valor >= atencao) return BASE_COLORS.yellow;
    return BASE_COLORS.red;
  }

  return (
    <div className="container" style={{ padding: 20 }}>
      <Head><title>Dashboard Programação V8</title></Head>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="badge" style={{ background: BASE_COLORS.blue, color: "#fff", padding: "4px 8px", borderRadius: 8 }}>V8</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Dashboard Programação V8</div>
            <div style={{ color: "#475569", fontSize: 13 }}>Linhas de referência fixas, tabela e ranking</div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
            <div style={{ padding: "6px 8px", borderRadius: 8, background: "#f1f5f9", border: "1px solid #e6edf3" }}>{status}</div>
          </div>
        </div>

        {/* selectors */}
        {schools.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", gap: 16, alignItems: "center" }}>
            <div>
              <label style={{ fontWeight: 600, marginRight: 8 }}>Escola</label>
              <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)} style={{ padding: 6, borderRadius: 6 }}>
                {schools.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontWeight: 600, marginRight: 8 }}>Indicador</label>
              <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)} style={{ padding: 6, borderRadius: 6 }}>
                {metricNames.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* chart */}
        {chartData.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{selectedMetric} — {selectedSchool}</div>
            <div style={{ width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="Semana" />
                  <YAxis domain={valorEhPercentual ? [0, 100] : ["auto", "auto"]} tickFormatter={valorEhPercentual ? v => `${v}%` : undefined} />
                  <Tooltip formatter={(v) => valorEhPercentual ? `${v.toFixed(1)}%` : v.toFixed(2)} />
                  <Legend />
                  <ReferenceLine y={linhaVerde} stroke={BASE_COLORS.green} strokeDasharray="4 4">
                    <Label value="Meta" position="right" fill={BASE_COLORS.green} fontSize={12} />
                  </ReferenceLine>
                  <ReferenceLine y={linhaAmarela} stroke={BASE_COLORS.yellow} strokeDasharray="4 4">
                    <Label value="Atenção" position="right" fill={BASE_COLORS.yellow} fontSize={12} />
                  </ReferenceLine>
                  <Line
                    type="monotone"
                    dataKey={ // pick correct key that holds values for selectedMetric
                      selectedMetric === "Índice de exercícios" ? "Exercicios"
                        : selectedMetric === "Acessos no período" ? "Acessos"
                        : "Acerto"
                    }
                    stroke={BASE_COLORS.blue}
                    strokeWidth={3}
                    dot={({ cx, cy, payload }) => (
                      <circle cx={cx} cy={cy} r={6} fill={payload.Color} stroke="#fff" strokeWidth={1.8} />
                    )}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* table: indicators as rows, weeks as columns */}
        {timeseries.length > 0 && (
          <div className="card" style={{ marginTop: 20, padding: 12, overflowX: "auto" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Dados da instituição — {selectedSchool}</div>

            <div style={{ minWidth: 700 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={{ padding: 8, border: "1px solid #e6edf3", textAlign: "center" }}>Indicador</th>
                    {chartData.map((c) => (
                      <th key={c.Semana} style={{ padding: 8, border: "1px solid #e6edf3", textAlign: "center" }}>
                        S{c.Semana}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { nome: "Índice de exercícios", meta: 2, atencao: 1, isPercent: false, key: "Exercicios" },
                    { nome: "Acessos no período", meta: 75, atencao: 50, isPercent: true, key: "Acessos" },
                    { nome: "Índice de acerto", meta: 70, atencao: 50, isPercent: true, key: "Acerto" }
                  ].map((indicador) => (
                    <tr key={indicador.nome}>
                      <td style={{ padding: 8, border: "1px solid #e6edf3", fontWeight: 700, background: "#f8fafc" }}>{indicador.nome}</td>
                      {chartData.map((c) => {
                        const valor = c[indicador.key] ?? 0;
                        const cor = getColor(valor, indicador.meta, indicador.atencao);
                        const texto = indicador.isPercent ? `${valor.toFixed(1)}%` : valor.toFixed(2);
                        return (
                          <td key={c.Semana} style={{ padding: 6, border: "1px solid #e6edf3", textAlign: "center" }}>
                            <div style={{
                              width: 56,
                              height: 36,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: cor,
                              color: "#000",
                              fontWeight: 700,
                              borderRadius: 6
                            }}>
                              {texto}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ranking below the table */}
        {ranking.length > 0 && (
          <div className="card" style={{ marginTop: 20, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Ranking das escolas — {selectedMetric}</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Posição</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Escola</th>
                  <th style={{ padding: 8, textAlign: "center" }}>Média</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => {
                  const destaque = r.escola === selectedSchool;
                  return (
                    <tr key={r.escola} style={{
                      background: destaque ? BASE_COLORS.lightBlue : i % 2 === 0 ? "#ffffff" : "#fbfdff",
                      fontWeight: destaque ? 700 : 400
                    }}>
                      <td style={{ padding: 8 }}>{i + 1}</td>
                      <td style={{ padding: 8 }}>{destaque ? "🔹 " : ""}{r.escola}</td>
                      <td style={{ padding: 8, textAlign: "center" }}>
                        { (selectedMetric === "Índice de exercícios") ? r.media.toFixed(2) : `${r.media.toFixed(1)}%` }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
