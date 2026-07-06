import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Products } from '@/components/sections/Products';

describe('Products Component', () => {
  it('se debe renderizar la seccion de productos y mostrar los planes primarios', () => {
    render(<Products />);

    // Verificamos que se renderice el título de la sección
    expect(screen.getByText(/Planes y/i)).toBeInTheDocument();
    expect(screen.getByText(/Productos/i)).toBeInTheDocument();

    // Verificamos que los tres planes estén visibles
    expect(screen.getByText('Web Starter')).toBeInTheDocument();
    expect(screen.getByText('Custom App')).toBeInTheDocument();
    expect(screen.getByText('Cyber Audit')).toBeInTheDocument();

    // Verificamos que aparezcan las características clave
    expect(screen.getByText('Desarrollo en Next.js (App Router)')).toBeInTheDocument();
    expect(screen.getByText('Base de datos segura y encriptada')).toBeInTheDocument();
    expect(screen.getByText('Auditoría Security by Design')).toBeInTheDocument();
  });
});
