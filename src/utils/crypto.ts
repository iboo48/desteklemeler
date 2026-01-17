import { SHA256 } from 'crypto-js';

export const hashTC = (tc: string): string => {
    return SHA256(tc).toString();
};
