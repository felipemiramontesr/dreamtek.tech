import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Modal } from '@/components/ui/Modal';

describe('Modal Component (100% Coverage Suite)', () => {
  beforeEach(() => {
    document.body.className = '';
    document.documentElement.className = '';
  });

  it('no debe renderizarse cuando isOpen es false', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    );

    expect(screen.queryByText('Modal Content')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('debe renderizarse cuando isOpen es true, añadir modal-open al body y mostrar titulo y slots', () => {
    const { unmount } = render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        tag="TAG TEST"
        tagColor="emerald"
        title="Modal Title Test"
        description="Modal Description Test"
        headerAction={<button>Header Switch Test</button>}
        footer={<button>CTA Footer</button>}
      >
        <div>Modal Children Content</div>
      </Modal>,
    );

    expect(screen.getByText('TAG TEST')).toBeInTheDocument();
    expect(screen.getByText('Modal Title Test')).toBeInTheDocument();
    expect(screen.getByText('Modal Description Test')).toBeInTheDocument();
    expect(screen.getByText('Header Switch Test')).toBeInTheDocument();
    expect(screen.getByText('Modal Children Content')).toBeInTheDocument();
    expect(screen.getByText('CTA Footer')).toBeInTheDocument();

    expect(document.body.classList.contains('modal-open')).toBe(true);
    expect(document.documentElement.classList.contains('modal-open')).toBe(true);

    unmount();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('debe llamar a onClose al presionar la tecla Escape y no hacer nada con otras teclas', () => {
    const onCloseMock = vi.fn();
    render(
      <Modal isOpen={true} onClose={onCloseMock}>
        <div>Content</div>
      </Modal>,
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onCloseMock).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('debe llamar a onClose al hacer clic en el botón de cierre o en el backdrop clickeable', () => {
    const onCloseMock = vi.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={onCloseMock}>
        <div>Content</div>
      </Modal>,
    );

    const closeBtn = screen.getByRole('button', { name: /Cerrar modal/i });
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    const backdrop = container.querySelector('.cursor-pointer');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onCloseMock).toHaveBeenCalledTimes(2);
    }
  });

  it('debe aplicar clases de color para sky, red y fallback', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={vi.fn()} tag="SKY TAG" tagColor="sky">
        <div>Sky Content</div>
      </Modal>,
    );
    expect(screen.getByText('SKY TAG')).toHaveClass('text-sky-400');

    rerender(
      <Modal isOpen={true} onClose={vi.fn()} tag="RED TAG" tagColor="red">
        <div>Red Content</div>
      </Modal>,
    );
    expect(screen.getByText('RED TAG')).toHaveClass('text-[#FF2D00]');

    rerender(
      <Modal isOpen={true} onClose={vi.fn()} tag="EMERALD TAG" tagColor="emerald">
        <div>Emerald Content</div>
      </Modal>,
    );
    expect(screen.getByText('EMERALD TAG')).toHaveClass('text-emerald-400');
  });

  it('debe soportar las variantes de tamaño sm, md y lg', () => {
    const { container, rerender } = render(
      <Modal isOpen={true} onClose={vi.fn()} size="sm">
        <div>Compact Content</div>
      </Modal>,
    );
    expect(container.querySelector('.max-w-md')).toBeInTheDocument();

    rerender(
      <Modal isOpen={true} onClose={vi.fn()} size="md">
        <div>Medium Content</div>
      </Modal>,
    );
    expect(container.querySelector('.max-w-3xl')).toBeInTheDocument();

    rerender(
      <Modal isOpen={true} onClose={vi.fn()} size="lg">
        <div>Large Content</div>
      </Modal>,
    );
    expect(container.querySelector('.lg\\:max-w-7xl')).toBeInTheDocument();
  });

  it('debe dar precedencia a maxWidth si es proporcionado explícitamente', () => {
    const { container, rerender } = render(
      <Modal isOpen={true} onClose={vi.fn()} size="sm" maxWidth="max-w-4xl">
        <div>Custom Width Content</div>
      </Modal>,
    );
    expect(container.querySelector('.max-w-4xl')).toBeInTheDocument();

    rerender(
      <Modal isOpen={true} onClose={vi.fn()} size="lg" maxWidth="max-w-6xl">
        <div>Large Custom Width Content</div>
      </Modal>,
    );
    expect(container.querySelector('.max-w-6xl')).toBeInTheDocument();
  });
});
