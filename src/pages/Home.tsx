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

            // 1. Calculate Hash
            const hashedTc = hashTC(tc);

            // 2. Calculate Shard ID (Mod 100)
            const bigVal = BigInt("0x" + hashedTc);
            const shardId = Number(bigVal % 100n);

            // 3. Fetch the Specific Shard JSON
            const baseUrl = import.meta.env.BASE_URL;
            const url = `${baseUrl}data/${dataId}/${shardId}.json`;
            console.log("Fetching shard:", url);

            const response = await fetch(url);

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Kayıt bulunamadı (Liste parçası yok).');
                }
                throw new Error('Veri listesi yüklenirken hata oluştu.');
            }

            const shardData = await response.json();

            // 4. Lookup Record in Shard
            // Format: { cols: [...], data: { hash: [vals] OR [[vals],[vals]] } }
            const recordValues = shardData.data[hashedTc];

            if (recordValues) {
                const cols = shardData.cols;

                // Helper to zip cols and vals into object
                const createObj = (vals: any[]) => {
                    const obj: any = {};
                    cols.forEach((col: string, idx: number) => {
                        obj[col] = vals[idx];
                    });
                    return obj;
                };

                let finalData;
                // Check if it's a single record or multiple (Array of Arrays)
                if (Array.isArray(recordValues[0])) {
                    // Multiple records
                    finalData = recordValues.map((v: any[]) => createObj(v));
                } else {
                    // Single record
                    finalData = createObj(recordValues);
                }

                setResult(finalData);
            } else {
                setError('Kayıt bulunamadı. Lütfen bilgileri kontrol ediniz.');
            }

        } catch (err: any) {
            console.error(err);
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
                            <p className="text-xs text-gray-500 mt-1">
                                * Bu sistem bilgilendirme amaçlıdır; lütfen kesin sonuçlar için askı listelerini kontrol ediniz.
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
                        <div className="mt-8 animate-fade-in space-y-8">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">
                                {SUPPORT_TYPES.find(t => t.id === dataId)?.label || 'Sorgulama Sonucu'}
                            </h3>

                            {(Array.isArray(result) ? result : [result]).map((item, index) => (
                                <div key={index} className="bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200">
                                    {(Array.isArray(result) && result.length > 1) && (
                                        <div className="bg-gray-50 px-4 py-2 border-b text-red-800 font-bold text-sm">
                                            {item['_title']
                                                ? `${item['_title']}`
                                                : `Kayıt #${index + 1} (${item['Adı Soyadı'] || item['Sahibi'] || ''})`}
                                        </div>
                                    )}
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {Object.entries(item).map(([key, value]) => {
                                                    // 1. FILTERING:
                                                    // 'tcHash' is internal.
                                                    // Empty keys.
                                                    // Empty values (null, undefined, empty string)
                                                    if (
                                                        key === 'tcHash' ||
                                                        key === '_title' ||
                                                        key.trim() === '' ||
                                                        value === null ||
                                                        value === undefined ||
                                                        String(value).trim() === ''
                                                    ) return null;

                                                    // NO AUTOMATIC FORMATTING
                                                    let displayValue = String(value);

                                                    // Just basic check for null/undefined
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
                            ))}
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
