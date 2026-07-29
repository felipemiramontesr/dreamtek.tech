-- 002_templates_seed.sql
-- Seed script for initial visual website templates
-- FC: protocols/fc/001c_FC_Onboarding_Wizard_and_Checkout.md (EN_FIRME)

INSERT INTO `templates` (`id`, `name`, `category`, `preview_image_url`, `description`, `is_active`)
VALUES 
  (
    'corporate',
    'Corporativo Elite',
    'Corporativo',
    '/images/templates/corporate.png',
    'Diseño corporativo elegante y profesional optimizado para posicionamiento B2B e instituciones.',
    1
  ),
  (
    'services',
    'Servicios & Consultoría',
    'Servicios',
    '/images/templates/services.png',
    'Estructura orientada a conversión de prospectos para agencias, despachos y firmas de consultoría.',
    1
  ),
  (
    'ecommerce',
    'Catálogo & E-commerce',
    'Comercio',
    '/images/templates/ecommerce.png',
    'Layout dinámico enfocado en showcase de productos, catálogo interactivo y pasarela de ventas.',
    1
  )
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `description` = VALUES(`description`);
