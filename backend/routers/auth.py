from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import timedelta
from .. import database, schemas, crud, auth

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"],
)

@router.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(database.get_db)):
    user = await crud.get_user(db, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/register", response_model=schemas.User)
async def register_user(user: schemas.UserCreate, db: AsyncSession = Depends(database.get_db)):
    db_user = await crud.get_user(db, user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    return await crud.create_user(db, user=user)

@router.get("/me", response_model=schemas.User)
async def read_users_me(current_user: schemas.User = Depends(auth.get_current_user)):
    return current_user

@router.put("/me", response_model=schemas.User)
async def update_users_me(
    user_update: schemas.UserCreate,
    current_user: schemas.User = Depends(auth.get_current_user),
    db: AsyncSession = Depends(database.get_db)
):
    # Check if new username is taken (if changed)
    if user_update.username != current_user.username:
        existing_user = await crud.get_user(db, user_update.username)
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already registered")
            
    updated_user = await crud.update_user(db, current_user.id, user_update)
    return updated_user
