use dm_domain::{ErrorCode, Result};
use std::{future::Future, time::Duration};

/// Match the desktop's repeated status polling without retrying download commands.
pub async fn until_ready<T, F, P>(deadline: Duration, mut poll: F) -> Result<T>
where
    F: FnMut() -> P,
    P: Future<Output = Result<Option<T>>>,
{
    let mut last_engine_error = None;
    let outcome = tokio::time::timeout(deadline, async {
        loop {
            match poll().await {
                Ok(Some(value)) => return Ok(value),
                Ok(None) => (),
                Err(error) if error.code == ErrorCode::Engine => {
                    eprintln!("Status poll failed; retrying within {deadline:?}: {error}");
                    last_engine_error = Some(error);
                }
                Err(error) => return Err(error),
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await;
    outcome.unwrap_or_else(|_| {
        Err(dm_domain::AppError::new(
            ErrorCode::Engine,
            format!(
                "Transfer polling timed out after {deadline:?}. Last engine error: {last_engine_error:?}"
            ),
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use dm_domain::AppError;
    use std::future::{pending, ready};

    #[tokio::test]
    async fn transient_engine_error_is_retried_until_completion() {
        let mut attempts = 0;
        let result = until_ready(Duration::from_secs(5), || {
            attempts += 1;
            ready(match attempts {
                1 => Err(AppError::new(ErrorCode::Engine, "tellStatus timed out")),
                2 => Ok(None),
                _ => Ok(Some("completed")),
            })
        })
        .await
        .unwrap();
        assert_eq!(result, "completed");
        assert_eq!(attempts, 3);
    }

    #[tokio::test]
    async fn non_engine_errors_fail_without_retrying() {
        let mut attempts = 0;
        let error = until_ready::<(), _, _>(Duration::from_secs(5), || {
            attempts += 1;
            ready(Err(AppError::new(
                ErrorCode::Persistence,
                "database unavailable",
            )))
        })
        .await
        .unwrap_err();
        assert_eq!(error.code, ErrorCode::Persistence);
        assert_eq!(attempts, 1);
    }

    #[tokio::test]
    async fn persistent_engine_errors_expire_with_the_last_error() {
        let error = until_ready::<(), _, _>(Duration::from_millis(20), || {
            ready(Err(AppError::new(
                ErrorCode::Engine,
                "tellStatus timed out",
            )))
        })
        .await
        .unwrap_err();
        assert!(error.message.contains("Transfer polling timed out"));
        assert!(error.message.contains("tellStatus timed out"));
    }

    #[tokio::test]
    async fn deadline_also_bounds_a_poll_that_never_returns() {
        let error = until_ready::<(), _, _>(Duration::from_millis(20), pending)
            .await
            .unwrap_err();
        assert!(error.message.contains("Transfer polling timed out"));
    }

    #[tokio::test]
    async fn successful_polls_without_completion_still_time_out() {
        let error = until_ready::<(), _, _>(Duration::from_millis(20), || ready(Ok(None)))
            .await
            .unwrap_err();
        assert!(error.message.contains("Transfer polling timed out"));
    }
}
