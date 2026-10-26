import {
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import {
  Observable,
  Subject,
  merge,
  of,
} from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  scan,
  shareReplay,
  startWith,
} from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { BranchService } from '../../services/branch.service';
import {
  BranchSearchVM,
  INITIAL_BRANCH_VM,
} from '../../models/branch.model';

const MAX_RECENT = 5;

@Component({
  selector: 'app-branch-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './branch-search.component.html',
  styleUrl: './branch-search.component.scss',
})
export class BranchSearchComponent implements OnInit {
  private readonly branchService = inject(BranchService);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly manualSearch$ = new Subject<string>();

  readonly searchTerm$ = merge(
    this.searchControl.valueChanges,
    this.manualSearch$
  ).pipe(
    startWith(''),
    debounceTime(0),
    map((term) => term.trim()),
    distinctUntilChanged(),
    filter((term) => term.length >= 2 || term.length === 0)
  );

  readonly vm$: Observable<BranchSearchVM> = this.searchTerm$.pipe(
    mergeMap((term) =>
      this.branchService.searchBranches(term).pipe(
        map((results) => ({
          results,
          isLoading: false,
          error: null,
          term,
        })),
        startWith({
          results: [],
          isLoading: true,
          error: null,
          term,
        }),
        catchError((err) =>
          of({
            results: [],
            isLoading: false,
            error: err?.message ?? 'Errore sconosciuto',
            term,
          })
        )
      )
    ),
    // Share one pipeline among all subscribers (template, analytics, recents)
    shareReplay({ bufferSize: 1, refCount: true })
  );

  readonly vm =  toSignal(this.vm$, { initialValue: INITIAL_BRANCH_VM });

  // Derived from vm$: only completed, successful, non-empty searches are recorded.
  readonly recentSearches$: Observable<string[]> = this.vm$.pipe(
    filter(
      (vm) =>
        !vm.isLoading && !vm.error && vm.results.length > 0 && vm.term.length >= 2
    ),
    map((vm) => vm.term),
    distinctUntilChanged(),
    scan(
      (recent, term) =>
        [term, ...recent.filter((t) => t !== term)].slice(0, MAX_RECENT),
      [] as string[]
    ),
    startWith([] as string[])
  );

  readonly recentSearches = toSignal(this.recentSearches$, {
    initialValue: [] as string[],
  });

  selectRecent(term: string): void {
    this.searchControl.setValue(term);
  }

  ngOnInit(): void {
    this.vm$.subscribe((vm) =>
      console.log('[analytics] vm changed:', vm.term)
    );
  }
}
