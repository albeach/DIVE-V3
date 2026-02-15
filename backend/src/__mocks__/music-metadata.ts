/**
 * Manual mock for music-metadata (ESM-only package, requires moduleNameMapper)
 */
export const parseBuffer = jest.fn().mockResolvedValue({
    format: {
        duration: 0,
        bitrate: 0,
        sampleRate: 0,
        codec: '',
        numberOfChannels: 0,
        container: '',
        lossless: false,
    },
    common: {},
    native: {},
});

export const parseFile = jest.fn().mockResolvedValue({
    format: {},
    common: {},
    native: {},
});
