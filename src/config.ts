export const DISTRICTS = [
    'Menteşe', 'Bodrum', 'Dalaman', 'Datça', 'Fethiye', 'Kavaklıdere',
    'Köyceğiz', 'Marmaris', 'Seydikemer', 'Milas', 'Ortaca', 'Ula', 'Yatağan'
];

export interface SupportType {
    id: string;      // Unique filename ID (e.g., 'buzagi2025_1')
    label: string;   // Display name (e.g., '2025 Yılı 1. Dönem Buzağı')
}

// You can add new supports here without changing the core code.
// The 'id' must match the filename you generate in Admin panel (without .json).
export const SUPPORT_TYPES: SupportType[] = [
    { id: 'buzagi2025_1', label: '2025 Yılı Birinci Dönem Buzağı Desteklemesi' },
    { id: 'kuzuoglak2025_1', label: '2025 Yılı Birinci Dönem Kuzu Oğlak Desteklemesi' },
    // Example for future:
    // { id: 'buzagi2025_2', label: '2025 Yılı İkinci Dönem Buzağı Desteklemesi' },
    // { id: 'mazot2025', label: 'Mazot ve Gübre Desteği' },
];
