import { Handler } from '@netlify/functions';
import path from 'path';
import fs from 'fs';

const handler: Handler = async (event, context) => {
    const { district, type, hash, dataId } = event.queryStringParameters || {};

    // Support backward compatibility or direct dataId usage
    // We prefer 'dataId' coming from the frontend, but if mapped via 'type' logic in frontend, it comes as dataId.
    // In our new frontend, we will pass `dataId=buzagi2025_1`.
    const targetId = dataId || type;

    if (!hash) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Eksik parametre: Hash gerekli.' }),
        };
    }

    if (!targetId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Eksik parametre: Destek Türü (Data ID) seçilmedi.' }),
        };
    }

    // Security: Allow only alphanumeric characters and underscores to prevent directory traversal
    // This prevents someone from requesting ../../../etc/passwd form
    if (!/^[a-z0-9_]+$/i.test(targetId)) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Geçersiz destek türü ID. (Sadece harf, rakam ve alt çizgi)' }),
        };
    }

    try {
        const fileName = `${targetId}.json`;
        // Look in 'data' subdirectory first (new standard)
        const dataPath = path.resolve(__dirname, 'data', fileName);

        // Fallback? No, let's stick to strict paths for security, unless it's the exact old legacy file.
        // However, we moved 'uploaddata.json' to 'data/buzagi2025_1.json' in our task, so we assume 'data/' is the place.

        if (!fs.existsSync(dataPath)) {
            console.error("Data file not found at:", dataPath);
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: 'Bu destek türüne ait veri dosyası sunucuda bulunamadı.',
                    debug: { searchedPath: `data/${fileName}` }
                }),
            };
        }

        const rawData = fs.readFileSync(dataPath, 'utf-8');
        const data = JSON.parse(rawData);

        // Filter logic
        const record = data.find((item: any) => item.tcHash === hash);

        if (record) {
            return {
                statusCode: 200,
                body: JSON.stringify(record),
            };
        } else {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    message: 'Kayıt bulunamadı. Lütfen bilgileri kontrol ediniz.'
                }),
            };
        }

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Sunucu hatası.' }),
        };
    }
};

export { handler };
