import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '@/components/ui/Button';

describe('Button Component', () => {
  it('se debe renderizar sin errores mostrando el texto correcto', () => {
    render(<Button>Explorar</Button>);
    expect(screen.getByText('Explorar')).toBeInTheDocument();
  });

  it('debe aplicar la clase de variante outline cuando se requiere', () => {
    render(<Button variant="outline">Consultoría</Button>);
    const button = screen.getByText('Consultoría');

    // Verificamos que tenga estilos de glassmorphism esperados
    expect(button).toHaveClass('border-white/30');
    expect(button).toHaveClass('bg-transparent');
  });

  it('debe despachar eventos onClick correctamente', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);

    const button = screen.getByText('Click Me');
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
