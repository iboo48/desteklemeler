import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { hashTC } from '../utils/crypto';

interface DataRow {
    [key: string]: any;
}

// Key = HashedTC, Value = EncryptedString
interface EncryptedOutput {
    [key: string]: string;
}

// ... imports
export const AdminConverter: React.FC = () => {
    // ... basic file state
    const [file, setFile] = useState<File | null>(null);
    const [jsonOutput, setJsonOutput] = useState<EncryptedOutput | null>(null);
    const [processing, setProcessing] = useState(false);
    const [previewCount, setPreviewCount] = useState(0);
    const [fileId, setFileId] = useState('');

    // Manual Inputs
    const [headerRowNo, setHeaderRowNo] = useState<number>(1);
    const [tcColLetter, setTcColLetter] = useState<string>('');
    const [useDoubleHeader, setUseDoubleHeader] = useState<boolean>(false);

    // Filter / Format / Mapping State
    // const [inspectionData, setInspectionData] = useState<{ col: string; val: string; index: number }[] | null>(null);
    const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
    const [currencyCols, setCurrencyCols] = useState<Set<number>>(new Set()); // Indexes of columns to format as Currency
    const [statusMsg, setStatusMsg] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);

            const name = selectedFile.name.split('.')[0]
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '');
            setFileId(name);

            setJsonOutput(null);
            setStatusMsg('');
            // setInspectionData(null);
            setDetectedHeaders([]);
            setCurrencyCols(new Set());
            setTcColLetter('');
        }
    };

    // ... helpers (getColIndex) same
    const getColIndex = (letter: string): number => {
        const decoded = XLSX.utils.decode_col(letter.toUpperCase());
        return decoded;
    };

    // ... getMergedHeaders same
    const getMergedHeaders = (rawRows: any[], headerIndex: number, useDouble: boolean) => {
        const childRow = rawRows[headerIndex];

        if (!useDouble || headerIndex === 0) {
            return childRow.map((h: any, idx: number) => String(h || `Sütun${idx}`).trim());
        }

        const parentRow = rawRows[headerIndex - 1];
        const mergedHeaders: string[] = [];
        let lastParent = '';

        for (let i = 0; i < childRow.length; i++) {
            const pVal = parentRow[i];
            const cVal = childRow[i];

            if (pVal !== undefined && pVal !== null && String(pVal).trim() !== '') {
                lastParent = String(pVal).trim();
            }

            const childText = String(cVal || '').trim();

            if (childText && lastParent && !childText.startsWith(lastParent)) {
                mergedHeaders.push(`${lastParent} ${childText}`);
            } else if (childText) {
                mergedHeaders.push(childText);
            } else if (lastParent) {
                mergedHeaders.push(lastParent);
            } else {
                mergedHeaders.push(`Sütun${i}`);
            }
        }
        return mergedHeaders;
    };

    const toggleCurrencyCol = (index: number) => {
        const newSet = new Set(currencyCols);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setCurrencyCols(newSet);
    };

    const inspectFile = () => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                // RAW: TRUE (default) -> Read expected numbers as numbers 
                // We want RAW values so we can format them cleanly ourselves if selected.
                const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });

                const headerIndex = Math.max(0, headerRowNo - 1);
                const rowToShowIndex = headerIndex;

                if (rowToShowIndex >= rawRows.length) {
                    alert("Satır okunamadı. Satır numarasını kontrol edin.");
                    return;
                }

                // Temporary logic to get headers just for "TC Column Selection" Preview
                const row = rawRows[rowToShowIndex];
                if (!row || !Array.isArray(row)) {
                    alert("Seçilen satır boş veya geçersiz.");
                    // setInspectionData(null);
                    return;
                }

                // const map = row.map((val: any, idx: number) => {
                //     const letter = XLSX.utils.encode_col(idx);
                //     return { col: letter, val: String(val ?? '(boş)'), index: idx };
                // });
                // setInspectionData(map);

                // Full Headers Logic for "Currency Column Selection"
                // Must simulate the double header logic if checked
                const computedHeaders = getMergedHeaders(rawRows, headerIndex, useDoubleHeader);
                setDetectedHeaders(computedHeaders);

                setStatusMsg(`Başlıklar algılandı. Lütfen T.C. Sütununu seçin ve Para Birimi olan sütunları işaretleyin.`);
            } catch (e: any) {
                alert("Hata: " + e.message);
            }
        };
        reader.readAsBinaryString(file);
    };

    const processFile = async () => {
        if (!file) return;
        if (!tcColLetter) {
            alert("Lütfen T.C. Sütununu seçiniz.");
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

                // RAW: TRUE -> Get raw numbers (e.g. 5600.5)
                const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
                const headerIndex = Math.max(0, headerRowNo - 1);

                if (headerIndex >= rawRows.length) throw new Error(`Satır ${headerRowNo} bulunamadı.`);

                const headers = getMergedHeaders(rawRows, headerIndex, useDoubleHeader);
                const tcIndex = getColIndex(tcColLetter);
                const encryptedMap: EncryptedOutput = {};
                let count = 0;

                for (let i = headerIndex + 1; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    if (!row || !Array.isArray(row) || row.length === 0) continue;
                    if (row.every(cell => cell === null || cell === undefined || cell === '')) continue;

                    const obj: DataRow = {};
                    let tcValueForKey = '';

                    headers.forEach((headerName: string, colIdx: number) => {
                        let val = row[colIdx];
                        const cleanHeader = headerName.replace(/\./g, '').trim();

                        // 1. Check if TC
                        if (colIdx === tcIndex) {
                            if (val !== undefined && val !== null) {
                                const tcStr = String(val).trim();
                                if (tcStr.length > 2) {
                                    tcValueForKey = tcStr;
                                }
                            }
                        } else {
                            // 2. Regular Columns
                            if (val !== undefined && val !== null) {
                                // 3. MANUAL FORMATTING CHECK
                                if (currencyCols.has(colIdx)) {
                                    // FORCE FORMATTING AS TR CURRENCY
                                    // Val is likely a number (since raw=true) or a string like "5600"
                                    const numVal = Number(val);
                                    if (!isNaN(numVal)) {
                                        const formatted = new Intl.NumberFormat('tr-TR', {
                                            style: 'currency',
                                            currency: 'TRY',
                                            minimumFractionDigits: 2
                                        }).format(numVal);
                                        // "₺5.600,00" -> "5.600,00 ₺"
                                        val = formatted.replace('₺', '').trim() + ' ₺';
                                    } else {
                                        // Fallback if not a number
                                        val = String(val);
                                    }
                                }
                                obj[cleanHeader] = val;
                            }
                        }
                    });

                    if (tcValueForKey) {
                        const lookupKey = hashTC(tcValueForKey);
                        const plainText = JSON.stringify(obj);
                        encryptedMap[lookupKey] = plainText;
                        count++;
                    }
                }

                if (count === 0) {
                    alert(`UYARI: "${tcColLetter}" sütununda veri bulunamadı!`);
                    setStatusMsg('Hata: Kayıt bulunamadı.');
                } else {
                    alert(`${count} kişi başarıyla işlendi.`);
                    setStatusMsg(`Tamamlandı: ${count} satır.`);
                }

                setJsonOutput(encryptedMap);
                setPreviewCount(count);

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
        if (!fileId) { alert("Dosya ID giriniz."); return; }
        const fileName = `${fileId}.json`;
        const json = JSON.stringify(jsonOutput, null, 2);
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
        <div className="p-8 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Admin: Gelişmiş Excel Dönüştürücü</h1>

            <div className="bg-white p-6 rounded shadow mb-6 space-y-6">

                <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">1. Excel Dosyası Seçin</label>
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded border">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">2. Başlık Satır Numarası (ALT SATIR)</label>
                        <input
                            type="number"
                            min="1"
                            value={headerRowNo}
                            onChange={(e) => setHeaderRowNo(parseInt(e.target.value) || 1)}
                            className="w-full border p-2 rounded"
                        />
                        <div className="mt-2 flex items-center">
                            <input
                                type="checkbox"
                                id="doubleHeader"
                                checked={useDoubleHeader}
                                onChange={(e) => setUseDoubleHeader(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <label htmlFor="doubleHeader" className="ml-2 text-sm text-gray-700 font-semibold cursor-pointer">
                                Üst satırla birleştir (Merge Headers)
                            </label>
                        </div>
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

                <div className="border-t pt-4">
                    <button
                        onClick={inspectFile}
                        disabled={!file}
                        className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 w-full mb-4 font-semibold shadow"
                    >
                        🔍 Sütunları Listele (Önizle)
                    </button>

                    {detectedHeaders.length > 0 && (
                        <div className="mb-6">
                            <h3 className="font-bold text-lg mb-2 text-blue-800">Sütun Ayarları</h3>
                            <p className="text-sm text-gray-600 mb-4 bg-yellow-50 p-2 border-l-4 border-yellow-400">
                                Lütfen <strong>T.C. Sütunu</strong>'nu seçin ve <strong>Para Birimi (₺)</strong> formatında görünmesini istediğiniz sütunları işaretleyin.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto border p-2 rounded bg-gray-50">
                                {detectedHeaders.map((header, idx) => {
                                    const colLetter = XLSX.utils.encode_col(idx);
                                    const isTc = tcColLetter === colLetter;
                                    const isCurrency = currencyCols.has(idx);

                                    return (
                                        <div key={idx} className={`p-2 rounded border flex flex-col justify-between ${isTc ? 'bg-red-100 border-red-500' : 'bg-white'}`}>
                                            <div className="flex items-start justify-between mb-2">
                                                <span className="font-mono text-xs font-bold bg-gray-200 px-1 rounded">{colLetter}</span>
                                                <button
                                                    onClick={() => setTcColLetter(colLetter)}
                                                    className={`text-xs px-2 py-0.5 rounded ${isTc ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-red-100'}`}
                                                >
                                                    {isTc ? 'T.C. SEÇİLDİ' : 'T.C. Yap'}
                                                </button>
                                            </div>

                                            <div className="font-semibold text-sm mb-2 break-words leading-tight" title={header}>
                                                {header}
                                            </div>

                                            <div className="mt-auto pt-2 border-t flex items-center">
                                                <input
                                                    type="checkbox"
                                                    id={`curr-${idx}`}
                                                    checked={isCurrency}
                                                    onChange={() => toggleCurrencyCol(idx)}
                                                    disabled={isTc} // TC cannot be currency
                                                    className="w-4 h-4 text-green-600 rounded cursor-pointer"
                                                />
                                                <label htmlFor={`curr-${idx}`} className={`ml-2 text-xs font-bold cursor-pointer ${isCurrency ? 'text-green-700' : 'text-gray-500'}`}>
                                                    {isCurrency ? 'PARA BİRİMİ (₺)' : 'Para Birimi Yap'}
                                                </label>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <button
                        onClick={processFile}
                        disabled={!file || !tcColLetter || processing}
                        className="bg-green-600 text-white px-4 py-4 rounded disabled:opacity-50 hover:bg-green-700 w-full font-bold text-lg shadow-lg"
                    >
                        {processing ? 'İŞLENİYOR...' : '5. ÇEVİRMEK İÇİN TIKLA'}
                    </button>
                </div>

                {statusMsg && (
                    <div className={`p-3 text-center rounded font-medium ${statusMsg.includes('Hata') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {statusMsg}
                    </div>
                )}
            </div>

            {jsonOutput && (
                <div className="bg-gray-50 p-4 rounded">
                    <h2 className="text-xl font-semibold mb-2">Başarılı ({previewCount} kayıt)</h2>
                    <p className="text-sm text-gray-600 mb-4">Dosya başarıyla oluşturuldu. İndirip sisteme yükleyebilirsiniz.</p>
                    <button
                        onClick={downloadJson}
                        className="bg-blue-800 text-white px-6 py-3 rounded font-bold hover:bg-blue-900 w-full"
                    >
                        JSON DOSYASINI İNDİR
                    </button>
                </div>
            )}

            {/* INFO GUIDE SECTION */}
            <div className="mt-12 bg-yellow-50 border border-yellow-200 rounded p-6 text-sm text-gray-700">
                <h3 className="font-bold text-lg mb-4 text-yellow-800 flex items-center">
                    <span className="text-2xl mr-2">💡</span> Yönetici Bilgi Notları: Yeni Destek Nasıl Eklenir?
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h4 className="font-bold border-b border-yellow-300 pb-1 mb-2">1. Bu JSON Dosyası Nereye Yüklenecek?</h4>
                        <p className="mb-2">
                            İndirdiğiniz dosyayı projenin içindeki şu klasöre atmanız gerekmektedir:
                        </p>
                        <code className="block bg-black text-white p-2 rounded mb-2 font-mono">
                            public/data/
                        </code>
                        <p className="text-xs text-gray-500">
                            Örneğin dosya adı <b>buzagi2025.json</b> ise, tam yol şöyle olmalıdır:<br />
                            <code>.../Desteklemeler/public/data/buzagi2025.json</code>
                        </p>
                    </div>

                    <div>
                        <h4 className="font-bold border-b border-yellow-300 pb-1 mb-2">2. Sorgulama Listesine Nasıl Eklenir?</h4>
                        <p className="mb-2">
                            Yeni desteğin listede görünmesi için şu dosyayı düzenlemelisiniz:
                        </p>
                        <code className="block bg-black text-white p-2 rounded mb-2 font-mono">
                            src/config.ts
                        </code>
                        <p className="mb-2">Dosyayı açıp listeye şunun gibi ekleme yapın:</p>
                        <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                            {`{ id: 'json_dosya_ismi', label: 'Ekranda Görünecek İsim' },`}
                        </pre>
                        <p className="text-xs text-gray-500 mt-1">
                            Önemli: <b>id</b> kısmı, JSON dosyasının ismiyle (uzantısız) birebir aynı olmalıdır.
                        </p>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-yellow-200">
                    <p className="font-bold">Örnek Senaryo:</p>
                    <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                        <li>Admin panelinden dosyayı <b>arilik2026</b> ID'si ile oluşturdunuz.</li>
                        <li>İnen <b>arilik2026.json</b> dosyasını <b>public/data/</b> altına attınız.</li>
                        <li><b>src/config.ts</b> dosyasına gidip <code>{`{ id: 'arilik2026', label: '2026 Arılık Desteği' }`}</code> satırını eklediniz.</li>
                        <li>Siteyi güncellediniz (Build & Push). Artık yayında!</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
