import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Modal } from '@/components/ui/Modal';

describe('Modal Component', () => {
  beforeEach(() => {
    document.body.className = '';
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
    render(
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
  });

  it('debe llamar a onClose al hacer clic en el botón de cierre', () => {
    const onCloseMock = vi.fn();
    render(
      <Modal isOpen={true} onClose={onCloseMock}>
        <div>Content</div>
      </Modal>,
    );

    const closeBtn = screen.getByRole('button', { name: /Cerrar modal/i });
    fireEvent.click(closeBtn);

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('debe llamar a onClose al hacer clic en el backdrop de fondo', () => {
    const onCloseMock = vi.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={onCloseMock}>
        <div>Content</div>
      </Modal>,
    );

    const backdrop = container.querySelector('.fixed.inset-0 > .absolute.inset-0');
    expect(backdrop).toBeInTheDocument();

    fireEvent.click(backdrop!);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('debe llamar a onClose al presionar la tecla Escape', () => {
    const onCloseMock = vi.fn();
    render(
      <Modal isOpen={true} onClose={onCloseMock}>
        <div>Content</div>
      </Modal>,
    );

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
