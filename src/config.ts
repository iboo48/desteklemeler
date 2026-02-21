// BU DOSYANIN KONUMU: src/config.ts
export interface SupportType {
    id: string;      // Unique filename ID (e.g., 'buzagi2025_1')
    label: string;   // Display name (e.g., '2025 Yılı 1. Dönem Buzağı')
}

// Data IDs must match the uploaded filename IDs (without .json)
export const SUPPORT_TYPES: SupportType[] = [
    //{ id: 'buzagiaski2025_1', label: '2025 Yılı Birinci Dönem Buzağı Desteklemesi Askı Listesi' },
    //{ id: 'kuzuoglakaski2025_1', label: '2025 Yılı Birinci Dönem Küçükbaş Hayvancılık Desteklemeleri Askı Listesi' },
    { id: 'sutaski2025_1', label: '2025 Yılı Dördüncü Dönem Süt Desteklemeleri Askı Listesi' },
];
