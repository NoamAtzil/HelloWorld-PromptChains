export default function Loading() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true" aria-label="Loading">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <div className="skeleton h-7 w-48 !rounded-full" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-4/5" />
          <div className="skeleton h-12 w-64" />
        </div>
        <div className="skeleton hidden aspect-[5/4] w-full !rounded-[2.5rem] lg:block" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="skeleton h-72 !rounded-[1.25rem]" />
        <div className="skeleton h-72 !rounded-[1.25rem]" />
        <div className="skeleton h-72 !rounded-[1.25rem]" />
      </div>
    </div>
  );
}
