import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea
} from "recharts";

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [uploadedFile, setUploadedFile] = useState(null);

  // Função para processar Excel em JSON
  const processExcel = (file) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target.result, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      
      // Filtra semanas 24 e 25
      const filtered = sheet.filter(row => row.semana !== 24 && row.semana !== 25);
      setData(filtered);
    };
    reader.readAsBinaryString(file);
  };

  // Carrega arquivo padrão ao iniciar
  useEffect(() => {
    fetch("/data_padrao.xlsx")
      .then(res => res.arrayBuffer())
      .then(buffer => {
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        const filtered = sheet.filter(row => row.semana !== 24 && row.semana !== 25);
        setData(filtered);
      });
  }, []);

  // Upload do usuário
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedFile(file);
    processExcel(file);
  };

  // Define cor do ponto
  const getColor = (y, ref) => {
    if (y >= ref) return "green";
    if (y >= 0.5 * ref) return "yellow";
    return "red";
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Dashboard</h1>
      
      <input type="file" accept=".xlsx, .xls" onChange={handleUpload} />
      
      <p>Arquivo padrão: <b>data_padrao.xlsx</b></p>
      {uploadedFile && <p>Arquivo enviado: <b>{uploadedFile.name}</b></p>}

      <LineChart
        width={800}
        height={400}
        data={data}
        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="semana" label={{ value: "Semana", position: "insideBottom", offset: -5 }} />
        <YAxis />
        <Tooltip />

        {/* Linha de referência */}
        <ReferenceLine y={50} stroke="blue" strokeDasharray="3 3" label="Meta" />

        {/* Observação férias */}
        <ReferenceArea x1={24} x2={25} strokeOpacity={0.3} label="Férias escolares" />

        {/* Linha com pontos coloridos */}
        <Line
          type="monotone"
          dataKey="valor"
          stroke="#8884d8"
          dot={data.map((entry) => ({
            r: 5,
            fill: getColor(entry.valor, 50) // 50 é valor da linha de referência
          }))}
        />
      </LineChart>
    </div>
  );
}

