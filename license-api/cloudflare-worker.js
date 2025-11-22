/**
 * Cloudflare Worker pour validation de licence
 * Alternative à Vercel - Plus simple et plus rapide
 */

// Configuration - Les variables seront dans le dashboard Cloudflare
// Ne pas mettre de vraies clés ici !

/**
 * Validation avec Gumroad
 */
async function validateGumroad(licenseKey, env) {
    try {
        const formData = new URLSearchParams();
        formData.append('product_id', env.GUMROAD_PRODUCT_ID);
        formData.append('license_key', licenseKey);

        const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData
        });

        const data = await response.json();
        return response.ok && data.success;
    } catch (error) {
        console.error('Gumroad validation error:', error);
        return false;
    }
}

/**
 * Validation avec Home of Editors
 */
async function validateHomeOfEditors(licenseKey, env) {
    try {
        const response = await fetch('https://homeofeditors.vercel.app/api/license/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                key: licenseKey
            })
        });

        const data = await response.json();
        
        // Vérifier que la réponse est valide et que c'est le bon produit
        return response.ok && 
               data.valid === true && 
               data.product?.id === env.HOME_OF_EDITORS_PRODUCT_ID;
    } catch (error) {
        console.error('Home of Editors validation error:', error);
        return false;
    }
}

/**
 * Gestionnaire principal des requêtes
 */
async function handleRequest(request, env) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle OPTIONS for CORS
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // Route: Health check
    if (url.pathname === '/api/health' || url.pathname === '/health') {
        return new Response(JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            env: {
                hasGumroadKey: !!env.GUMROAD_PRODUCT_ID,
                hasHomeOfEditorsKey: !!env.HOME_OF_EDITORS_PRODUCT_ID
            }
        }), {
            headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    }

    // Route: Validate license
    if ((url.pathname === '/api/validate-license' || url.pathname === '/validate-license') && request.method === 'POST') {
        try {
            const body = await request.json();
            const licenseKey = body.licenseKey;

            // Validation de base
            if (!licenseKey || typeof licenseKey !== 'string') {
                return new Response(JSON.stringify({
                    success: false,
                    message: 'License key invalide'
                }), {
                    status: 400,
                    headers: { 
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }

            // Sanitize la license key
            const cleanLicenseKey = licenseKey.trim();

            if (cleanLicenseKey.length < 10) {
                return new Response(JSON.stringify({
                    success: false,
                    message: 'License key trop courte'
                }), {
                    status: 400,
                    headers: { 
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }

            // Essayer Gumroad d'abord
            console.log('Tentative validation Gumroad...');
            const isValidGumroad = await validateGumroad(cleanLicenseKey, env);
            
            if (isValidGumroad) {
                console.log('✓ Validation Gumroad réussie');
                return new Response(JSON.stringify({
                    success: true,
                    message: 'License validée avec succès',
                    provider: 'gumroad'
                }), {
                    headers: { 
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }

            // Si Gumroad échoue, essayer Home of Editors
            console.log('Tentative validation Home of Editors...');
            const isValidHomeOfEditors = await validateHomeOfEditors(cleanLicenseKey, env);
            
            if (isValidHomeOfEditors) {
                console.log('✓ Validation Home of Editors réussie');
                return new Response(JSON.stringify({
                    success: true,
                    message: 'License validée avec succès',
                    provider: 'homeofeditors'
                }), {
                    headers: { 
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }

            // Les deux ont échoué
            console.log('✗ Validation échouée sur tous les providers');
            return new Response(JSON.stringify({
                success: false,
                message: 'License key invalide'
            }), {
                status: 400,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });

        } catch (error) {
            console.error('Erreur lors de la validation:', error);
            return new Response(JSON.stringify({
                success: false,
                message: 'Erreur serveur lors de la validation'
            }), {
                status: 500,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
    }

    // Route: Root
    if (url.pathname === '/' || url.pathname === '/api') {
        return new Response(JSON.stringify({
            name: 'YoutubetoPremiere License API',
            version: '1.0.0',
            endpoints: {
                validate: 'POST /api/validate-license',
                health: 'GET /api/health'
            }
        }), {
            headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    }

    // 404
    return new Response('Not Found', { 
        status: 404,
        headers: corsHeaders
    });
}

// Export pour Cloudflare Workers
export default {
    async fetch(request, env, ctx) {
        return handleRequest(request, env);
    }
};

