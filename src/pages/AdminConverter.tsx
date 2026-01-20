import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { hashTC } from '../utils/crypto';

interface DataRow {
    [key: string]: any;
}

// Key = HashedTC or HashedVKN, Value = EncryptedString
interface EncryptedOutput {
    [key: string]: string;
}

export const AdminConverter: React.FC = () => {
    // 1. FILES STATE (Multi-file support)
    const [files, setFiles] = useState<File[]>([]);
    const [jsonOutput, setJsonOutput] = useState<EncryptedOutput | null>(null);
    const [processing, setProcessing] = useState(false);
    const [previewCount, setPreviewCount] = useState(0);
    const [fileId, setFileId] = useState('');

    // Manual Inputs
    const [headerRowNo, setHeaderRowNo] = useState<number>(1);
    const [tcColLetter, setTcColLetter] = useState<string>('');
    const [vknColLetter, setVknColLetter] = useState<string>(''); // NEW: VKN Selection
    const [useDoubleHeader, setUseDoubleHeader] = useState<boolean>(false);

    // Filter / Format / Mapping State
    const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
    const [currencyCols, setCurrencyCols] = useState<Set<number>>(new Set());
    const [statusMsg, setStatusMsg] = useState('');
    const [maskedCols, setMaskedCols] = useState<Set<number>>(new Set());
    const [ignoredCols, setIgnoredCols] = useState<Set<number>>(new Set());
    const [titleCol, setTitleCol] = useState<number | null>(null);

    // Helper: Mask Name (Ali Veli -> Al* Ve*)
    const maskName = (fullName: string) => {
        return fullName.split(' ').map(word => {
            if (word.length < 3) return word;
            return word.substring(0, 2) + '*'.repeat(word.length - 2);
        }).join(' ');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFiles = Array.from(e.target.files);
            setFiles(selectedFiles);

            // Use the FIRST file's name as default ID suggestion
            const name = selectedFiles[0].name.split('.')[0]
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '');
            setFileId(name);

            setJsonOutput(null);
            setStatusMsg(`${selectedFiles.length} dosya seçildi. Başlıkları görmek için önizleme yapın.`);
            setDetectedHeaders([]);
            setCurrencyCols(new Set());
            setMaskedCols(new Set());
            setIgnoredCols(new Set());
            setTitleCol(null);
            setTcColLetter('');
            setVknColLetter('');
        }
    };

    const getColIndex = (letter: string): number => {
        const decoded = XLSX.utils.decode_col(letter.toUpperCase());
        return decoded;
    };

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

            // FIXED LOGIC: Only use Parent if Child exists.
            // If Child is empty, ignore Parent (avoids "Oğlak Sayısı" in empty cols)
            if (childText && lastParent && !childText.startsWith(lastParent)) {
                mergedHeaders.push(`${lastParent} ${childText}`);
            } else if (childText) {
                mergedHeaders.push(childText);
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
            // Cannot be both currency and masked usually, but let's allow or handle if needed.
        }
        setCurrencyCols(newSet);
    };

    const toggleMaskedCol = (index: number) => {
        const newSet = new Set(maskedCols);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
            // If masking, perform check on ignored? usually mutually exclusive but user can toggle.
        }
        setMaskedCols(newSet);
    };

    const toggleIgnoredCol = (index: number) => {
        const newSet = new Set(ignoredCols);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setIgnoredCols(newSet);
    };

    const toggleTitleCol = (index: number) => {
        if (titleCol === index) {
            setTitleCol(null);
        } else {
            setTitleCol(index);
        }
    };

    const inspectFile = () => {
        if (files.length === 0) return;

        // Inspect only the first file
        const fileToInspect = files[0];
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
                const headerIndex = Math.max(0, headerRowNo - 1);

                if (headerIndex >= rawRows.length) {
                    alert("Satır okunamadı.");
                    return;
                }

                const computedHeaders = getMergedHeaders(rawRows, headerIndex, useDoubleHeader);
                setDetectedHeaders(computedHeaders);

                setStatusMsg(`Başlıklar algılandı. Lütfen T.C. ve varsa VKN sütununu seçin.`);
            } catch (e: any) {
                alert("Hata: " + e.message);
            }
        };
        reader.readAsBinaryString(fileToInspect);
    };

    // Helper to process content of one file
    const processContent = (bstr: any, encryptedMap: EncryptedOutput, tcIndex: number, vknIndex: number): number => {
        // Capture titleCol in closure scope or pass it? It uses component state which is not accessible in this helper efficiently if passed to worker/promise.
        // Wait, processContent is inside the component, so it can access 'titleCol'.
        // But let's check if 'titleCol' is stale. It should be fine as it's called from processFile which is triggered by button click.
        const currentTitleCol = titleCol;

        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
        const headerIndex = Math.max(0, headerRowNo - 1);

        if (headerIndex >= rawRows.length) return 0;

        const headers = getMergedHeaders(rawRows, headerIndex, useDoubleHeader);
        let count = 0;

        for (let i = headerIndex + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || !Array.isArray(row) || row.length === 0) continue;
            if (row.every(cell => cell === null || cell === undefined || cell === '')) continue;

            const obj: DataRow = {};
            let masterKey = '';

            // 1. Determine Identity Key
            if (tcIndex !== -1 && row[tcIndex]) {
                const val = String(row[tcIndex]).trim();
                if (val.length > 2) masterKey = val;
            }
            // Fallback to VKN if no TC
            if (!masterKey && vknIndex !== -1 && row[vknIndex]) {
                const val = String(row[vknIndex]).trim();
                if (val.length > 2) masterKey = val;
            }

            if (!masterKey) continue;

            // 2. Build Object
            headers.forEach((headerName: string, colIdx: number) => {
                let val = row[colIdx];

                // OPTIMIZATION & EXCLUSION: Skip empty values OR Ignored Columns
                if (ignoredCols.has(colIdx)) return;
                if (val === undefined || val === null || val === '') return;
                if (typeof val === 'string' && val.trim() === '') return;

                // PRIVACY & OPTIMIZATION: Do not include TC or VKN in the payload
                if (colIdx === tcIndex || colIdx === vknIndex) return;

                const cleanHeader = headerName.replace(/\./g, '').trim();

                // 3. Format Currency
                if (currencyCols.has(colIdx)) {
                    const numVal = Number(val);
                    if (!isNaN(numVal)) {
                        const formatted = new Intl.NumberFormat('tr-TR', {
                            style: 'currency',
                            currency: 'TRY',
                            minimumFractionDigits: 2
                        }).format(numVal);
                        val = formatted.replace('₺', '').trim() + ' ₺';
                    } else {
                        val = String(val);
                    }
                }

                // 4. MASKING (KVKK)
                if (maskedCols.has(colIdx)) {
                    val = maskName(String(val));
                }

                obj[cleanHeader] = val;

                // 5. TITLE EXTRACTION
                if (colIdx === currentTitleCol) {
                    obj['_title'] = String(val).trim();
                }
            });

            const lookupKey = hashTC(masterKey);

            // DUPLICATE HANDLING: Support multiple records for same TC
            if (encryptedMap[lookupKey]) {
                try {
                    const existing = JSON.parse(encryptedMap[lookupKey]);
                    let newData;
                    if (Array.isArray(existing)) {
                        existing.push(obj);
                        newData = existing;
                    } else {
                        // Convert single object to array and add new one
                        newData = [existing, obj];
                    }
                    encryptedMap[lookupKey] = JSON.stringify(newData);
                } catch (e) {
                    // Fallback if parse error (should unlikely happen), just overwrite
                    console.error("Merge error", e);
                    encryptedMap[lookupKey] = JSON.stringify(obj);
                }
            } else {
                // First record for this TC
                encryptedMap[lookupKey] = JSON.stringify(obj);
            }

            count++;
        }
        return count;
    };

    const processFile = async () => {
        if (files.length === 0) return;
        if (!tcColLetter && !vknColLetter) {
            alert("Lütfen en az bir Kimlik Sütunu (T.C. veya VKN) seçiniz.");
            return;
        }

        setProcessing(true);
        setStatusMsg('İşleniyor...');

        const tcIndex = tcColLetter ? getColIndex(tcColLetter) : -1;
        const vknIndex = vknColLetter ? getColIndex(vknColLetter) : -1;

        const encryptedMap: EncryptedOutput = {};
        let totalCount = 0;
        let processedFiles = 0;

        for (const file of files) {
            try {
                const count = await new Promise<number>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        try {
                            const c = processContent(evt.target?.result, encryptedMap, tcIndex, vknIndex);
                            resolve(c);
                        } catch (e) { reject(e); }
                    };
                    reader.onerror = (e) => reject(e);
                    reader.readAsBinaryString(file);
                });

                totalCount += count;
                processedFiles++;
                setStatusMsg(`${processedFiles}/${files.length} dosya işlendi...`);
            } catch (err: any) {
                console.error(`Error processing file ${file.name}:`, err);
                alert(`Hata (${file.name}): ` + err.message);
            }
        }

        if (totalCount === 0) {
            alert(`UYARI: Hiçbir satırda geçerli kayıt bulunamadı!`);
            setStatusMsg('Hata: Kayıt bulunamadı.');
        } else {
            alert(`${totalCount} kişi/kurum başarıyla işlendi.`);
            setStatusMsg(`Tamamlandı: ${totalCount} satır.`);
        }

        setJsonOutput(encryptedMap);
        setPreviewCount(totalCount);
        setProcessing(false);
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
            <h1 className="text-2xl font-bold mb-4">Admin: Çoklu Excel Dönüştürücü (TC/VKN)</h1>

            <div className="bg-white p-6 rounded shadow mb-6 space-y-6">

                <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">1. Excel Dosyaları Seçin (Çoklu Seçim)</label>
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        multiple
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700"
                    />
                    {files.length > 0 && (
                        <p className="mt-2 text-sm text-green-600 font-semibold">{files.length} dosya seçildi.</p>
                    )}
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
                        disabled={files.length === 0}
                        className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 w-full mb-4 font-semibold shadow"
                    >
                        🔍 Sütunları Listele (Önizle)
                    </button>

                    {detectedHeaders.length > 0 && (
                        <div className="mb-6">
                            <h3 className="font-bold text-lg mb-2 text-blue-800">Sütun Ayarları</h3>
                            <p className="text-sm text-gray-600 mb-4 bg-yellow-50 p-2 border-l-4 border-yellow-400">
                                Lütfen <strong>T.C.</strong> ve varsa <strong>VKN</strong> sütununu seçin.
                                (Bu veri gizlilik gereği JSON içeriğine kaydedilmez, sadece sorgulama anahtarı olur).
                            </p>

                            <div className="mb-4 bg-blue-50 p-4 rounded border border-blue-200 text-sm space-y-2">
                                <h4 className="font-bold text-blue-900 border-b border-blue-300 pb-1 mb-2">Seçenekler Rehberi</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded border">TC</span>
                                        <span className="bg-blue-600 text-white text-[10px] px-2 py-1 rounded border">VKN</span>
                                        <span className="text-gray-700 font-medium">= Sorgulama Anahtarı (Gizli tutulur)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-green-700 font-bold">Para Birimi (₺)</span>
                                        <span className="text-gray-600">= Sayısal değerleri para birimi formatına çevirir (örn: 1.234,56 ₺)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-purple-700 font-bold">Maskele (Ad Soyad)</span>
                                        <span className="text-gray-600">= İsimleri maskeler (örn: AL** VE**)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-red-700 font-bold line-through">Yoksay (Sil)</span>
                                        <span className="text-gray-600">= Bu sütun JSON dosyasına eklenmez</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-orange-700 font-bold">Başlık Yap (İşletme No)</span>
                                        <span className="text-gray-600">= Kart başlığı olarak kullanılır (örn: Kişinin birden fazla işletmesi varsa başlıklardan ayırabilir)</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto border p-2 rounded bg-gray-50">
                                {detectedHeaders.map((header, idx) => {
                                    const colLetter = XLSX.utils.encode_col(idx);
                                    const isTc = tcColLetter === colLetter;
                                    const isVkn = vknColLetter === colLetter;
                                    const isCurrency = currencyCols.has(idx);

                                    return (
                                        <div key={idx} className={`p-2 rounded border flex flex-col justify-between ${isTc ? 'bg-red-100 border-red-500' : isVkn ? 'bg-blue-100 border-blue-500' : 'bg-white'}`}>
                                            <div className="flex items-start justify-between mb-2">
                                                <span className="font-mono text-xs font-bold bg-gray-200 px-1 rounded">{colLetter}</span>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => {
                                                            if (isTc) setTcColLetter('');
                                                            else {
                                                                setTcColLetter(colLetter);
                                                                if (isVkn) setVknColLetter('');
                                                            }
                                                        }}
                                                        className={`text-[10px] px-2 py-1 rounded border ${isTc ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-red-50'}`}
                                                    >
                                                        TC
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (isVkn) setVknColLetter('');
                                                            else {
                                                                setVknColLetter(colLetter);
                                                                if (isTc) setTcColLetter('');
                                                            }
                                                        }}
                                                        className={`text-[10px] px-2 py-1 rounded border ${isVkn ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-50'}`}
                                                    >
                                                        VKN
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="font-semibold text-sm mb-2 break-words leading-tight" title={header}>
                                                {header}
                                            </div>

                                            <div className="mt-auto pt-2 border-t flex flex-col gap-1">
                                                <div className="flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        id={`curr-${idx}`}
                                                        checked={isCurrency}
                                                        onChange={() => toggleCurrencyCol(idx)}
                                                        disabled={isTc || isVkn}
                                                        className="w-4 h-4 text-green-600 rounded cursor-pointer"
                                                    />
                                                    <label htmlFor={`curr-${idx}`} className={`ml-2 text-xs font-bold cursor-pointer ${isCurrency ? 'text-green-700' : 'text-gray-500'}`}>
                                                        {isCurrency ? 'PARA (₺)' : 'Para Birimi'}
                                                    </label>
                                                </div>
                                                <div className="flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        id={`mask-${idx}`}
                                                        checked={maskedCols.has(idx)}
                                                        onChange={() => toggleMaskedCol(idx)}
                                                        disabled={isTc || isVkn}
                                                        className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                                                    />
                                                    <label htmlFor={`mask-${idx}`} className={`ml-2 text-xs font-bold cursor-pointer ${maskedCols.has(idx) ? 'text-purple-700' : 'text-gray-500'}`}>
                                                        {maskedCols.has(idx) ? 'GİZLİ (KVKK)' : 'Maskele(Ad Soyad)'}
                                                    </label>
                                                </div>
                                                <div className="flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        id={`ignore-${idx}`}
                                                        checked={ignoredCols.has(idx)}
                                                        onChange={() => toggleIgnoredCol(idx)}
                                                        disabled={isTc || isVkn}
                                                        className="w-4 h-4 text-red-600 rounded cursor-pointer"
                                                    />
                                                    <label htmlFor={`ignore-${idx}`} className={`ml-2 text-xs font-bold cursor-pointer ${ignoredCols.has(idx) ? 'text-red-700 line-through' : 'text-gray-500'}`}>
                                                        {ignoredCols.has(idx) ? 'YOKSAYILDI' : 'Yoksay (Sil)'}
                                                    </label>
                                                </div>
                                                <div className="flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        id={`title-${idx}`}
                                                        checked={titleCol === idx}
                                                        onChange={() => toggleTitleCol(idx)}
                                                        disabled={isTc || isVkn}
                                                        className="w-4 h-4 text-orange-600 rounded cursor-pointer"
                                                    />
                                                    <label htmlFor={`title-${idx}`} className={`ml-2 text-xs font-bold cursor-pointer ${titleCol === idx ? 'text-orange-700' : 'text-gray-500'}`}>
                                                        {titleCol === idx ? 'BAŞLIK ETİKETİ' : 'Başlık Yap(İşletme No)'}
                                                    </label>
                                                </div>
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
                        disabled={files.length === 0 || (!tcColLetter && !vknColLetter) || processing}
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
                    <p className="text-sm text-gray-600 mb-4">
                        Dosya oluşturuldu. (KVKK: TC/VKN verileri JSON içeriğine kaydedilmedi, sadece şifreli anahtar olarak kullanıldı).
                    </p>
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
