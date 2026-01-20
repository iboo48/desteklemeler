import React, { useState } from 'react';
import { hashTC } from '../utils/crypto';
import { SUPPORT_TYPES } from '../config';

export const Home: React.FC = () => {
    // const [district, setDistrict] = useState(''); // REMOVED
    const [dataId, setDataId] = useState(''); // Selected Support ID
    const [tc, setTc] = useState('');
    const [result, setResult] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setResult(null);

        try {
            if (!dataId || !tc) {
                throw new Error('Lütfen tüm alanları doldurunuz.');
            }

            if (tc.length !== 11 && tc.length !== 10) {
                throw new Error('T.C. (11) veya Vergi No (10) giriniz.');
            }

            // 1. Calculate Hash of TC (Lookup Key)
            const hashedTc = hashTC(tc);

            // 2. Fetch the STATIC JSON file using dynamic BASE_URL
            // Note: In Vite, 'public' folder is served at root.
            // On GitHub Pages, we are at /Desteklemeler/, so we need import.meta.env.BASE_URL
            const baseUrl = import.meta.env.BASE_URL; // e.g. "/" or "/Desteklemeler/"
            const response = await fetch(`${baseUrl}data/${dataId}.json`);

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Seçilen ilgili liste bulunamadı (Dosya yok).');
                }
                throw new Error('Veri listesi yüklenirken hata oluştu.');
            }

            const encryptedMap = await response.json();

            // 3. Lookup the encrypted record
            const encryptedRecord = encryptedMap[hashedTc];

            if (encryptedRecord) {
                // 4. No Decryption needed anymore
                try {
                    // Veri artık düz string (stringify edilmiş JSON) veya eğer fetch otomatik parse ettiyse obje olabilir.
                    // Ancak yapı gereği map[hash] = string (JSON string) saklıyorduk.
                    const decryptedData = typeof encryptedRecord === 'string'
                        ? JSON.parse(encryptedRecord)
                        : encryptedRecord;

                    setResult(decryptedData);
                } catch (decErr) {
                    console.error(decErr);
                    throw new Error('Veri okunamadı. Format hatalı olabilir.');
                }
            } else {
                setError('Kayıt bulunamadı. Lütfen bilgileri kontrol ediniz.');
            }

        } catch (err: any) {
            setError(err.message || 'Bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center py-10 px-4">
            <div className="max-w-3xl w-full bg-white rounded-lg shadow-xl overflow-hidden">
                <header className="bg-red-700 text-white p-4 relative flex items-center justify-center min-h-[120px]">
                    {/* Logo: Absolute Left on Desktop, Hidden/Stacked on Mobile if needed but user wants it Left. 
                        Let's use absolute positioning for desktop to ensure text is purely centered relative to container. */}
                    <div className="absolute left-6 hidden md:block">
                        <img
                            src="https://upload.wikimedia.org/wikipedia/commons/6/6d/Tar%C4%B1m_ve_Orman_Bakanl%C4%B1%C4%9F%C4%B1_logo.svg"
                            alt="Logo"
                            className="h-24 w-auto brightness-0 invert"
                        />
                    </div>

                    {/* Mobile Logo (visible only on small screens, stacked) */}
                    <div className="md:hidden mb-4">
                        <img
                            src="https://upload.wikimedia.org/wikipedia/commons/6/6d/Tar%C4%B1m_ve_Orman_Bakanl%C4%B1%C4%9F%C4%B1_logo.svg"
                            alt="Logo"
                            className="h-20 w-auto brightness-0 invert mx-auto"
                        />
                    </div>

                    <div className="text-center z-10 px-4 md:px-0">
                        <h1 className="text-xl md:text-2xl font-bold uppercase leading-tight tracking-wide">
                            T.C. MUĞLA VALİLİĞİ<br />
                            İL TARIM VE ORMAN MÜDÜRLÜĞÜ
                        </h1>
                        <h2 className="text-sm md:text-lg mt-2 font-medium text-red-100">Çiftçi Destekleme Sorgulama Sistemi</h2>
                    </div>
                </header>

                <div className="p-8">
                    <form onSubmit={handleSearch} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* REMOVED DISTRICT SELECTION */}
                            {/* Make Support Type full width or keep as is? Let's make it span full width since it is alone now in this row, or better, just list it. */}

                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Destekleme Türü</label>
                                <select
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 p-2 border"
                                    value={dataId}
                                    onChange={(e) => setDataId(e.target.value)}
                                >
                                    <option value="">Seçiniz</option>
                                    {SUPPORT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">T.C. Kimlik / Vergi Numarası</label>
                            <input
                                type="password"
                                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 p-2 border"
                                placeholder="T.C. (11) veya Vergi No (10)"
                                maxLength={11}
                                value={tc}
                                onChange={(e) => setTc(e.target.value.replace(/\D/g, ''))} // only numbers
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                * Kişisel verilerinizin güvenliği için T.C. Kimlik Numaranız şifrelenerek sorgulanmaktadır.
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-red-600 text-white font-bold py-3 rounded hover:bg-red-700 transition duration-200 disabled:opacity-50"
                        >
                            {loading ? 'Sorgulanıyor...' : 'Sorgula'}
                        </button>
                    </form>

                    {error && (
                        <div className="mt-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
                            <p>{error}</p>
                        </div>
                    )}

                    {result && (
                        <div className="mt-8 animate-fade-in">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">
                                {SUPPORT_TYPES.find(t => t.id === dataId)?.label || 'Sorgulama Sonucu'}
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {Object.entries(result).map(([key, value]) => {
                                            // 1. FILTERING:
                                            // 'tcHash' is internal.
                                            // 'Sıra No' is usually redundant but okay.
                                            // Empty keys.
                                            // 1. FILTERING:
                                            // 'tcHash' is internal.
                                            // Empty keys.
                                            // Empty values (null, undefined, empty string)
                                            if (
                                                key === 'tcHash' ||
                                                key.trim() === '' ||
                                                value === null ||
                                                value === undefined ||
                                                String(value).trim() === ''
                                            ) return null;

                                            // NO AUTOMATIC FORMATTING
                                            // Formatting is done in AdminConverter manually by user selection.
                                            // Here we just display whatever is in the JSON.
                                            let displayValue = String(value);

                                            // Just basic check for null/undefined if filtered above didn't catch it
                                            if (value === null || value === undefined) displayValue = '';

                                            return (
                                                <tr key={key}>
                                                    <td className="px-4 py-2 font-medium text-gray-900 bg-gray-50 capitalize w-1/3 border-r">{key}</td>
                                                    <td className="px-4 py-2 text-gray-700">{displayValue}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <footer className="bg-gray-800 text-gray-400 py-4 text-center text-xs">
                    <p>&copy; {new Date().getFullYear()} Muğla İl Tarım ve Orman Müdürlüğü</p>
                </footer>
            </div>
        </div>
    );
};
