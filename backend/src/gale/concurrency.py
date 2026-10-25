"""Structured concurrency helper."""

import asyncio
from collections.abc import Coroutine, Iterable
from typing import Any


async def gather[T](coroutines: Iterable[Coroutine[Any, Any, T]]) -> list[T]:
    """Run coroutines concurrently; on failure cancel the rest and raise the first error.

    ``asyncio.TaskGroup`` cancels siblings properly but wraps failures in an
    ``ExceptionGroup``; callers here want the original exception type so that
    the API layer can map it to an HTTP status.
    """
    try:
        async with asyncio.TaskGroup() as group:
            tasks = [group.create_task(coroutine) for coroutine in coroutines]
    except ExceptionGroup as failures:
        raise first_leaf(failures) from None
    return [task.result() for task in tasks]


def first_leaf(group: BaseExceptionGroup[BaseException]) -> BaseException:
    """The first non-group exception inside a (possibly nested) exception group."""
    first = group.exceptions[0]
    return first_leaf(first) if isinstance(first, BaseExceptionGroup) else first
