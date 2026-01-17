import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { hashTC } from '../utils/crypto';

interface DataRow {
    [key: string]: any;
}

export const AdminConverter: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [jsonData, setJsonData] = useState<DataRow[]>([]);
    const [processing, setProcessing] = useState(false);
    const [fileId, setFileId] = useState('');

    // Manual Inputs
    const [headerRowNo, setHeaderRowNo] = useState<number>(1);
    const [tcColLetter, setTcColLetter] = useState<string>('');

    // Inspection State
    const [inspectionData, setInspectionData] = useState<{ col: string; val: string; index: number }[] | null>(null);
    const [statusMsg, setStatusMsg] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);

            const name = selectedFile.name.split('.')[0]
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '');
            setFileId(name);

            setJsonData([]);
            setStatusMsg('');
            setInspectionData(null);
        }
    };

    // Helper to convert "A"->0, "B"->1, "AA"->26
    const getColIndex = (letter: string): number => {
        const decoded = XLSX.utils.decode_col(letter.toUpperCase());
        return decoded;
    };

    // INSPECT FILE FUNCTION
    const inspectFile = () => {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                // Read raw to find specific row
                const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });

                // Header is at row X, data is at X+1
                const headerIndex = Math.max(0, headerRowNo - 1);
                const dataRowIndex = headerIndex + 1;

                if (dataRowIndex >= rawRows.length) {
                    alert("Veri satırı okunamadı (Dosya sonuna gelindi). Başlık satırı numarasını kontrol edin.");
                    return;
                }

                const row = rawRows[dataRowIndex];
                if (!row || !Array.isArray(row)) {
                    alert("Veri satırı boş veya okunamadı.");
                    return;
                }

                // Map row data to [Col Letter] - [Value]
                const map = row.map((val: any, idx: number) => {
                    const letter = XLSX.utils.encode_col(idx);
                    return { col: letter, val: String(val ?? '(boş)'), index: idx };
                });

                setInspectionData(map);
                setStatusMsg(`Örnek veri satırı (${dataRowIndex + 1}. satır) aşağıda gösteriliyor. T.C. verisine tıklayın.`);

            } catch (e: any) {
                alert("İnceleme hatası: " + e.message);
            }
        };
        reader.readAsBinaryString(file);
    };

    const processFile = async () => {
        if (!file) return;
        if (!tcColLetter) {
            alert("Lütfen T.C. Kimlik numarasının olduğu Sütun Harfini giriniz (veya 🔍 butonuyla seçiniz).");
            return;
        }

        setProcessing(true);
        setStatusMsg('İşleniyor...');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
                const headerIndex = Math.max(0, headerRowNo - 1);

                if (headerIndex >= rawRows.length) throw new Error(`Satır ${headerRowNo} dosyada bulunamadı!`);

                const headers = rawRows[headerIndex];
                if (!Array.isArray(headers) || headers.length === 0) throw new Error(`${headerRowNo}. satırda başlık bulunamadı.`);

                const tcIndex = getColIndex(tcColLetter);
                const processedData: DataRow[] = [];
                let hashedCount = 0;

                for (let i = headerIndex + 1; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    if (!row || !Array.isArray(row) || row.length === 0) continue;
                    // Skip purely empty rows (visual check)
                    if (row.every(cell => cell === null || cell === undefined || cell === '')) continue;

                    const obj: DataRow = {};
                    let hasTc = false;

                    headers.forEach((headerName: any, colIdx: number) => {
                        const val = row[colIdx];
                        const cleanHeader = String(headerName || `Sütun${colIdx}`).trim();

                        if (colIdx === tcIndex) {
                            if (val !== undefined && val !== null) {
                                const tcStr = String(val).trim();
                                if (tcStr.length > 2) {
                                    obj['tcHash'] = hashTC(tcStr);
                                    hasTc = true;
                                }
                            }
                        } else {
                            if (val !== undefined && val !== null) {
                                // Remove dots from keys nicely
                                const safeHeader = cleanHeader.replace(/\./g, '');
                                obj[safeHeader] = val;
                            }
                        }
                    });

                    // If we found a TC in this row, add it.
                    // If NOT found, effectively skip valid support lines? 
                    // Usually support lists must have TC.
                    if (hasTc) {
                        processedData.push(obj);
                        hashedCount++;
                    }
                }

                if (hashedCount === 0) {
                    alert(`UYARI: "${tcColLetter}" sütununda hiç veri okunamadı! Seçimi kontrol ediniz.`);
                    setStatusMsg('Hata: Şifrelenen veri yok.');
                } else {
                    alert(`${hashedCount} kişi başarıyla şifrelendi.`);
                    setStatusMsg(`Tamamlandı: ${hashedCount} satır işlendi.`);
                }

                setJsonData(processedData);

            } catch (err: any) {
                console.error(err);
                alert("Hata: " + err.message);
                setStatusMsg("İşlem başarısız.");
            } finally {
                setProcessing(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const downloadJson = () => {
        if (!fileId) {
            alert("Lütfen bir Dosya Kimliği (ID) giriniz.");
            return;
        }
        const fileName = `${fileId}.json`;
        const json = JSON.stringify(jsonData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Admin: Gelişmiş Excel Dönüştürücü</h1>

            <div className="bg-white p-6 rounded shadow mb-6 space-y-6">

                {/* Step 1 */}
                <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">1. Excel Dosyası Seçin</label>
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
                    />
                </div>

                {/* Step 2: Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded border">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">2. Başlık Satır Numarası</label>
                        <input
                            type="number"
                            min="1"
                            value={headerRowNo}
                            onChange={(e) => setHeaderRowNo(parseInt(e.target.value) || 1)}
                            className="w-full border p-2 rounded focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">3. Dosya Kimliği (ID)</label>
                        <input
                            type="text"
                            value={fileId}
                            onChange={(e) => setFileId(e.target.value)}
                            placeholder="orn: buzagi2025"
                            className="w-full border p-2 rounded"
                        />
                    </div>
                </div>

                {/* INSPECTION AREA */}
                <div className="border-t pt-4">
                    <button
                        onClick={inspectFile}
                        disabled={!file}
                        className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 w-full mb-4 font-semibold shadow"
                    >
                        🔍 Dosya Yapısını ve Sütunları Göster (ÖNEMLİ)
                    </button>

                    {inspectionData && (
                        <div className="bg-blue-50 p-4 rounded max-h-80 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 border border-blue-200">
                            {inspectionData.map((item) => (
                                <div
                                    key={item.col}
                                    onClick={() => setTcColLetter(item.col)}
                                    className={`p-2 rounded cursor-pointer border text-center transition-colors ${tcColLetter === item.col ? 'bg-red-600 text-white border-red-800 shadow-md transform scale-105' : 'bg-white hover:bg-red-50 border-gray-300'}`}
                                >
                                    <div className="font-bold text-xs mb-1">{item.col}</div>
                                    <div className="text-xs truncate font-mono" title={item.val}>{item.val || '-'}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    {inspectionData && <p className="text-center text-xs text-Red-600 font-bold mt-2">Yukarıdaki kutucuklardan T.C. Numarasını içeren kutuya tıklayıp seçiniz.</p>}
                </div>

                <div>
                    <label className="block text-sm font-bold text-red-700 mb-1">4. Seçili Sütun Şifrelenecek:</label>
                    <input
                        type="text"
                        value={tcColLetter}
                        readOnly
                        className="w-full border p-2 rounded bg-gray-100 font-bold text-red-900"
                    />
                </div>

                <button
                    onClick={processFile}
                    disabled={!file || !tcColLetter || processing}
                    className="bg-green-600 text-white px-4 py-4 rounded disabled:opacity-50 hover:bg-green-700 w-full font-bold text-lg shadow-lg"
                >
                    {processing ? 'İŞLENİYOR...' : '5. ÇEVİR VE ŞİFRELE'}
                </button>

                {statusMsg && (
                    <div className={`p-3 text-center rounded font-medium ${statusMsg.includes('Hata') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {statusMsg}
                    </div>
                )}
            </div>

            {jsonData.length > 0 && (
                <div className="bg-gray-50 p-4 rounded">
                    <h2 className="text-xl font-semibold mb-2">Önizleme ({jsonData.length} satır)</h2>
                    <div className="overflow-auto max-h-60 border mb-4 bg-white">
                        <pre className="text-xs p-2">{JSON.stringify(jsonData.slice(0, 3), null, 2)}</pre>
                    </div>
                    <button
                        onClick={downloadJson}
                        className="bg-blue-800 text-white px-6 py-3 rounded font-bold hover:bg-blue-900 w-full"
                    >
                        GÜVENLİ JSON İNDİR ({fileId}.json)
                    </button>
                </div>
            )}
        </div>
    );
};
