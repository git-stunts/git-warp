# Slay QueryController (951 LOC)

Split strategy: query dispatch, observer factory, content access.

Heavy free-function pattern — 30+ functions wired onto prototype.
These become real methods when controller implements QueryCapability.
