import axios from 'axios';
export declare function createSiApiClient(): axios.AxiosInstance;
export declare function getApiToken(): string;
export declare function getApiUrl(): string;
export declare function getWebUrl(): string;
export declare function sleep(ms: number): Promise<void>;
