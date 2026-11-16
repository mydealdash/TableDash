import { Module } from '@nestjs/common';
import { GooglePlacesService } from './google-places.service';
import { GoogleController } from './google.controller';
import { GoogleSearchController } from './google-search.controller';
@Module({ providers: [GooglePlacesService], controllers: [GoogleController, GoogleSearchController], exports: [GooglePlacesService] })
export class GoogleModule {}
