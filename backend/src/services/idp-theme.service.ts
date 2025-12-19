/**
 * IdP Theme Service
 * 
 * Manages custom login page themes stored in MongoDB
 * Phase 1.7: Theme Management
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '../utils/logger';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { IIdPTheme } from '../types/keycloak.types';
import path from 'path';
import fs from 'fs/promises';

const COLLECTION_NAME = 'idp_themes';

/**
 * Cached MongoDB connection
 */
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

/**
 * Get MongoDB client (with caching)
 * BEST PRACTICE: Read URL at runtime
 */
async function getMongoClient(): Promise<MongoClient> {
    if (cachedClient) {
        try {
            await cachedClient.db().admin().ping();
            return cachedClient;
        } catch {
            // Connection lost, will reconnect below
        }
    }

    try {
        const MONGODB_URL = getMongoDBUrl(); // Read at runtime
        cachedClient = await MongoClient.connect(MONGODB_URL);
        logger.debug('MongoDB connected for IdP themes');
        return cachedClient;
    } catch (error) {
        logger.error('Failed to connect to MongoDB', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}

/**
 * Get MongoDB database
 * BEST PRACTICE: Read DB name at runtime
 */
async function getDb(): Promise<Db> {
    if (cachedDb) {
        return cachedDb;
    }

    const client = await getMongoClient();
    const DB_NAME = getMongoDBName(); // Read at runtime
    cachedDb = client.db(DB_NAME);
    return cachedDb;
}

/**
 * Get themes collection
 */
async function getThemesCollection(): Promise<Collection<IIdPTheme>> {
    const db = await getDb();
    return db.collection<IIdPTheme>(COLLECTION_NAME);
}

/**
 * Initialize themes collection
 */
export async function initializeThemesCollection(): Promise<void> {
    try {
        const collection = await getThemesCollection();

        // Create indexes
        await collection.createIndex({ idpAlias: 1 }, { unique: true });
        await collection.createIndex({ createdBy: 1 });
        await collection.createIndex({ createdAt: -1 });

        logger.info('IdP themes collection initialized');
    } catch (error) {
        logger.error('Failed to initialize themes collection', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}

/**
 * IdP Theme Service Class
 */
class IdPThemeService {
    /**
     * Get theme for IdP
     */
    async getTheme(idpAlias: string): Promise<IIdPTheme | null> {
        try {
            const collection = await getThemesCollection();
            const theme = await collection.findOne({ idpAlias });

            if (!theme) {
                logger.debug('No theme found for IdP', { idpAlias });
                return null;
            }

            logger.info('Retrieved theme', { idpAlias });
            return theme;
        } catch (error) {
            logger.error('Failed to get theme', {
                idpAlias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to get theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get default theme for country
     */
    getDefaultTheme(idpAlias: string, country?: string): IIdPTheme {
        const countryColors: Record<string, { primary: string; secondary: string; accent: string }> = {
            'USA': {
                primary: '#B22234',
                secondary: '#FFFFFF',
                accent: '#3C3B6E'
            },
            'FRA': {
                primary: '#0055A4',
                secondary: '#FFFFFF',
                accent: '#EF4135'
            },
            'CAN': {
                primary: '#FF0000',
                secondary: '#FFFFFF',
                accent: '#FF0000'
            },
            'GBR': {
                primary: '#012169',
                secondary: '#FFFFFF',
                accent: '#C8102E'
            },
            'DEU': {
                primary: '#000000',
                secondary: '#DD0000',
                accent: '#FFCE00'
            }
        };

        const colors = country && countryColors[country]
            ? countryColors[country]
            : { primary: '#6B46C1', secondary: '#FFFFFF', accent: '#9333EA' }; // Default purple

        return {
            idpAlias,
            enabled: false,
            colors: {
                ...colors,
                background: '#F9FAFB',
                text: '#111827'
            },
            background: {
                type: 'gradient',
                blur: 0,
                overlayOpacity: 0.1,
                gradientDirection: 'top-bottom'
            },
            logo: {
                url: '',
                position: 'top-center'
            },
            layout: {
                formPosition: 'center',
                formWidth: '400px',
                cardStyle: 'glassmorphism',
                buttonStyle: 'rounded',
                inputStyle: 'outlined'
            },
            typography: {
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 'medium'
            },
            localization: {
                defaultLanguage: 'en',
                enableToggle: true,
                supportedLanguages: ['en', 'fr']
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'system'
        };
    }

    /**
     * Create or update theme
     */
    async saveTheme(theme: Partial<IIdPTheme> & { idpAlias: string; createdBy: string }): Promise<IIdPTheme> {
        try {
            const collection = await getThemesCollection();
            const existing = await collection.findOne({ idpAlias: theme.idpAlias });

            if (existing) {
                // Update existing theme
                const updated: IIdPTheme = {
                    ...existing,
                    ...theme,
                    updatedAt: new Date()
                };

                await collection.updateOne(
                    { idpAlias: theme.idpAlias },
                    { $set: updated }
                );

                logger.info('Updated theme', { idpAlias: theme.idpAlias });
                return updated;
            } else {
                // Create new theme with defaults
                const defaultTheme = this.getDefaultTheme(theme.idpAlias);
                const newTheme: IIdPTheme = {
                    ...defaultTheme,
                    ...theme,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                await collection.insertOne(newTheme as any);

                logger.info('Created theme', { idpAlias: theme.idpAlias });
                return newTheme;
            }
        } catch (error) {
            logger.error('Failed to save theme', {
                idpAlias: theme.idpAlias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to save theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete theme
     */
    async deleteTheme(idpAlias: string): Promise<void> {
        try {
            const collection = await getThemesCollection();
            const result = await collection.deleteOne({ idpAlias });

            if (result.deletedCount === 0) {
                throw new Error('Theme not found');
            }

            // Also delete uploaded assets
            await this.deleteThemeAssets(idpAlias);

            logger.info('Deleted theme', { idpAlias });
        } catch (error) {
            logger.error('Failed to delete theme', {
                idpAlias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to delete theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Upload theme asset (background or logo)
     * Note: Image optimization with sharp can be added later
     */
    async uploadThemeAsset(
        idpAlias: string,
        file: Buffer,
        _filename: string,
        type: 'background' | 'logo'
    ): Promise<string> {
        try {
            // Create uploads directory if not exists
            const uploadsDir = path.join(process.cwd(), 'uploads', 'idp-themes', idpAlias);
            await fs.mkdir(uploadsDir, { recursive: true });

            // For now, save file directly (TODO: Add sharp optimization later)
            // Determine file extension
            const ext = type === 'background' ? 'jpg' : 'png';
            const filepath = path.join(uploadsDir, `${type}.${ext}`);
            await fs.writeFile(filepath, file);

            // Return public URL
            const publicUrl = `/uploads/idp-themes/${idpAlias}/${type}.${ext}`;

            logger.info('Uploaded theme asset', { idpAlias, type, url: publicUrl });
            return publicUrl;
        } catch (error) {
            logger.error('Failed to upload theme asset', {
                idpAlias,
                type,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to upload asset: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete theme assets
     */
    async deleteThemeAssets(idpAlias: string): Promise<void> {
        try {
            const uploadsDir = path.join(process.cwd(), 'uploads', 'idp-themes', idpAlias);

            // Check if directory exists
            try {
                await fs.access(uploadsDir);
                // Delete directory and all contents
                await fs.rm(uploadsDir, { recursive: true, force: true });
                logger.info('Deleted theme assets', { idpAlias });
            } catch (error) {
                // Directory doesn't exist, that's fine
                logger.debug('No theme assets to delete', { idpAlias });
            }
        } catch (error) {
            logger.error('Failed to delete theme assets', {
                idpAlias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            // Don't throw - asset deletion is not critical
        }
    }

    /**
     * Generate theme preview HTML
     */
    generatePreviewHTML(theme: IIdPTheme, _device: 'desktop' | 'tablet' | 'mobile' = 'desktop'): string {
        // Device-specific rendering can be added later if needed

        const html = `
<!DOCTYPE html>
<html lang="${theme.localization.defaultLanguage}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - ${theme.idpAlias}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: ${theme.typography.fontFamily};
            font-size: ${theme.typography.fontSize === 'small' ? '14px' : theme.typography.fontSize === 'large' ? '18px' : '16px'};
            background-color: ${theme.colors.background};
            color: ${theme.colors.text};
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }

        ${theme.background.type === 'image' && theme.background.imageUrl ? `
        .background-image {
            position: absolute;
            inset: 0;
            background-image: url('${theme.background.imageUrl}');
            background-size: cover;
            background-position: center;
            filter: blur(${theme.background.blur}px);
            opacity: ${1 - theme.background.overlayOpacity};
        }
        ` : `
        .background-gradient {
            position: absolute;
            inset: 0;
            background: linear-gradient(
                ${theme.background.gradientDirection === 'top-bottom' ? 'to bottom' : theme.background.gradientDirection === 'left-right' ? 'to right' : 'radial-gradient'},
                ${theme.colors.primary},
                ${theme.colors.accent}
            );
            opacity: 0.1;
        }
        `}

        .login-container {
            position: relative;
            z-index: 10;
            width: 90%;
            max-width: ${theme.layout.formWidth};
            display: flex;
            align-items: center;
            justify-content: ${theme.layout.formPosition};
        }

        .login-card {
            width: 100%;
            max-width: ${theme.layout.formWidth};
            padding: 2rem;
            ${theme.layout.cardStyle === 'glassmorphism' ? `
                background: rgba(255, 255, 255, 0.7);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.3);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            ` : theme.layout.cardStyle === 'solid' ? `
                background: white;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            ` : theme.layout.cardStyle === 'bordered' ? `
                background: white;
                border: 2px solid ${theme.colors.primary};
            ` : `
                background: white;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
            `}
            border-radius: ${theme.layout.buttonStyle === 'pill' ? '9999px' : theme.layout.buttonStyle === 'square' ? '0' : '0.5rem'};
        }

        .logo {
            text-align: center;
            margin-bottom: 2rem;
        }

        h1 {
            text-align: center;
            color: ${theme.colors.primary};
            margin-bottom: 1.5rem;
        }

        .form-group {
            margin-bottom: 1rem;
        }

        label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
        }

        input {
            width: 100%;
            padding: 0.75rem;
            ${theme.layout.inputStyle === 'outlined' ? `
                border: 1px solid #D1D5DB;
                border-radius: 0.375rem;
                background: white;
            ` : theme.layout.inputStyle === 'filled' ? `
                border: none;
                border-radius: 0.375rem;
                background: #F3F4F6;
            ` : `
                border: none;
                border-bottom: 2px solid #D1D5DB;
                background: transparent;
                border-radius: 0;
            `}
        }

        input:focus {
            outline: none;
            ${theme.layout.inputStyle === 'outlined' ? `
                border-color: ${theme.colors.primary};
                box-shadow: 0 0 0 3px ${theme.colors.primary}33;
            ` : theme.layout.inputStyle === 'filled' ? `
                background: #E5E7EB;
            ` : `
                border-bottom-color: ${theme.colors.primary};
            `}
        }

        button {
            width: 100%;
            padding: 0.75rem;
            background: ${theme.colors.primary};
            color: white;
            border: none;
            border-radius: ${theme.layout.buttonStyle === 'pill' ? '9999px' : theme.layout.buttonStyle === 'square' ? '0' : '0.375rem'};
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        button:hover {
            background: ${theme.colors.accent};
            transform: translateY(-1px);
            box-shadow: 0 4px 12px ${theme.colors.primary}44;
        }

        .footer-link {
            text-align: center;
            margin-top: 1rem;
            font-size: 0.875rem;
        }

        .footer-link a {
            color: ${theme.colors.primary};
            text-decoration: none;
        }
    </style>
</head>
<body>
    ${theme.background.type === 'image' && theme.background.imageUrl ? '<div class="background-image"></div>' : '<div class="background-gradient"></div>'}
    
    <div class="login-container">
        <div class="login-card">
            ${theme.logo.url ? `<div class="logo"><img src="${theme.logo.url}" alt="Logo" style="max-width: 200px; height: auto;" /></div>` : ''}
            
            <h1>${theme.localization.defaultLanguage === 'fr' ? 'Se Connecter' : 'Sign In'}</h1>
            
            <form>
                <div class="form-group">
                    <label>${theme.localization.defaultLanguage === 'fr' ? 'Nom d\'utilisateur' : 'Username'}</label>
                    <input type="text" placeholder="${theme.localization.defaultLanguage === 'fr' ? 'Entrez votre nom d\'utilisateur' : 'Enter your username'}" />
                </div>
                
                <div class="form-group">
                    <label>${theme.localization.defaultLanguage === 'fr' ? 'Mot de passe' : 'Password'}</label>
                    <input type="password" placeholder="${theme.localization.defaultLanguage === 'fr' ? 'Entrez votre mot de passe' : 'Enter your password'}" />
                </div>
                
                <button type="submit">${theme.localization.defaultLanguage === 'fr' ? 'Se Connecter' : 'Sign In'}</button>
                
                <div class="footer-link">
                    <a href="#">${theme.localization.defaultLanguage === 'fr' ? 'Mot de passe oublié ?' : 'Forgot password?'}</a>
                </div>
            </form>
        </div>
    </div>
</body>
</html>
        `.trim();

        return html;
    }
}

// Export singleton instance
export const idpThemeService = new IdPThemeService();
export { IdPThemeService };
