interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: Props) {
  const sizeClass = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }[size];
  return (
    <div
      className={`animate-spin rounded-full border-2 border-gray-200 border-t-blue-600 ${sizeClass} ${className}`}
    />
  );
}
